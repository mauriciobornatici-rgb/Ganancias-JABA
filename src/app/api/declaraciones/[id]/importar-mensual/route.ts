export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { prisma } from '@/domain/ganancias/prisma';
import {
  mapMonthlyDocumentsToTaxReturnInputs,
  buildIibbDeterminedExpenseDrafts,
  MONTHLY_IMPORT_SOURCE,
  type IibbDeterminedEntry,
  type MonthlyImportDocument,
} from '@/domain/ganancias/fiscalLedger/taxReturnMonthlyImport';
import {
  buildIdcbWithholdingDrafts,
  idcbImportNotice,
  uniqueIdcbPercent,
  IDCB_CERTIFICATE_PREFIX,
  IDCB_CREDIT_KEY,
  IDCB_TAX_CODE,
  type IdcbMonthlyEntry,
} from '@/domain/ganancias/fiscalLedger/bankTaxCredit';
import { readAnnualConsolidation } from '@/domain/ganancias/persistence/annualConsolidationRead';
import { persistAnnualConsolidationSnapshot } from '@/domain/ganancias/persistence/annualConsolidationSnapshot';
import type { GainsAllocationKind } from '@/domain/ganancias/fiscalLedger/annualConsolidation';
import { isTaxReturnEditable } from '@/domain/ganancias/workflow/taxReturnWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Importa el libro fiscal mensual (módulo IVA) hacia una DDJJ anual de Ganancias.
 *
 * Trae, comprobante por comprobante, SOLO los meses cotejados (IVA CLOSED), creando SalesInvoice /
 * PurchaseInvoice con el `expenseType` correcto (mercadería → CMV; gasto → deducible). Los bienes de
 * uso NO se crean como compra (requieren vida útil): se devuelven como candidatos a completar.
 *
 * También trae el impuesto al cheque (IDCB) cargado mes a mes en el libro mensual, como pago a cuenta
 * con `taxCode='IDCB'` (IG 25!F65) y una fila por mes. A diferencia de los comprobantes, NO exige que
 * el mes esté cotejado en IVA: el impuesto al cheque no depende de esa evidencia.
 *
 * Idempotente: borra solo los registros previamente importados (importSource='MONTHLY_LEDGER', y para
 * el IDCB las filas con certificado 'IDCB-AAAA-MM') y los recrea; las cargas manuales del usuario
 * quedan intactas. No toca la matemática de la determinación.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: taxReturnId } = await context.params;

  try {
    const taxReturn = await prisma.taxReturn.findUnique({
      where: { id: taxReturnId },
      select: {
        id: true,
        status: true,
        clientId: true,
        client: { select: { cuit: true, name: true } },
        fiscalYear: { select: { year: true } },
      },
    });
    if (!taxReturn) {
      return NextResponse.json({ success: false, error: 'La declaración no existe.' }, { status: 404 });
    }

    if (!isTaxReturnEditable(taxReturn.status)) {
      return NextResponse.json(
        { success: false, error: `La declaración está en estado ${taxReturn.status} y es inmutable. Reabrila con motivo antes de volver a importar.` },
        { status: 409 },
      );
    }

    const year = taxReturn.fiscalYear.year;
    const clientId = taxReturn.clientId;

    // Períodos del año con estado de IVA + comprobantes incluidos + IIBB cerrado del mes.
    const periods = await prisma.fiscalPeriod.findMany({
      where: { clientId, year },
      orderBy: { month: 'asc' },
      select: {
        month: true,
        vatSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
        grossIncomeSettlements: { where: { status: 'CLOSED' }, orderBy: { version: 'desc' }, take: 1, select: { totalDeterminedTax: true } },
        // Impuesto al cheque del mes + % computable vigente en el perfil de ESE período.
        taxProfile: { select: { idcbComputablePercent: true } },
        taxCredits: { where: { creditKey: IDCB_CREDIT_KEY }, select: { originalAmount: true } },
        documents: {
          where: { includedInSettlement: true },
          select: {
            id: true, direction: true, voucherType: true, voucherNumber: true, issueDate: true,
            counterpartyName: true, counterpartyCuit: true, netAmount: true, totalAmount: true,
            vatLines: { select: { kind: true, taxableBase: true, vatAmount: true, creditComputable: true } },
            allocations: { select: { gainsKind: true, needsReview: true }, take: 1 },
          },
        },
      },
    });

    // Impuesto al cheque (punto 5): se toma de TODOS los meses con importe cargado, no solo de los
    // cotejados en IVA. El cierre de IVA no es evidencia del impuesto al cheque, y dejar afuera un
    // mes cargado computaría de menos un pago a cuenta real. Cada mes usa el % de su propio perfil.
    const idcbEntries: IdcbMonthlyEntry[] = periods.flatMap(period => {
      const record = period.taxCredits[0];
      if (!record) return [];
      return [{
        year,
        month: period.month,
        totalAmount: new Decimal(record.originalAmount.toString()),
        computablePercent: period.taxProfile?.idcbComputablePercent,
      }];
    });

    // Solo meses con IVA CLOSED alimentan la anual.
    const closedPeriods = periods.filter(p => p.vatSettlements[0]?.status === 'CLOSED');
    if (closedPeriods.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay meses con IVA cotejado (CLOSED) para importar. Cerrá al menos un mes en el módulo de IVA.' },
        { status: 409 },
      );
    }

    const importDocs: MonthlyImportDocument[] = [];
    let iibbTotal = new Decimal(0);
    const iibbEntries: IibbDeterminedEntry[] = [];
    const monthsUsed: number[] = [];
    for (const period of closedPeriods) {
      monthsUsed.push(period.month);
      const iibb = period.grossIncomeSettlements[0]?.totalDeterminedTax;
      if (iibb) {
        const determinedTax = new Decimal(iibb.toString());
        iibbTotal = iibbTotal.add(determinedTax);
        iibbEntries.push({ year, month: period.month, determinedTax });
      }
      for (const d of period.documents) {
        importDocs.push({
          id: d.id,
          month: period.month,
          direction: d.direction as 'SALE' | 'PURCHASE',
          voucherType: d.voucherType,
          voucherNumber: d.voucherNumber,
          issueDate: d.issueDate,
          counterpartyName: d.counterpartyName,
          counterpartyCuit: d.counterpartyCuit,
          netAmount: new Decimal(d.netAmount.toString()),
          totalAmount: new Decimal(d.totalAmount.toString()),
          vatLines: d.vatLines.map(l => ({
            kind: String(l.kind),
            taxableBase: new Decimal(l.taxableBase.toString()),
            vatAmount: new Decimal(l.vatAmount.toString()),
            creditComputable: l.creditComputable,
          })),
          persistedGainsKind: (d.allocations[0]?.gainsKind ?? null) as GainsAllocationKind | null,
          persistedNeedsReview: d.allocations[0]?.needsReview,
        });
      }
    }

    const mapped = mapMonthlyDocumentsToTaxReturnInputs(importDocs);
    const iibbExpenseDrafts = buildIibbDeterminedExpenseDrafts(iibbEntries);
    const idcb = buildIdcbWithholdingDrafts(idcbEntries);

    // Reemplazo idempotente: borra lo importado antes (no las cargas manuales) y recrea.
    await prisma.$transaction([
      prisma.salesInvoice.deleteMany({ where: { taxReturnId, importSource: MONTHLY_IMPORT_SOURCE } }),
      prisma.purchaseInvoice.deleteMany({ where: { taxReturnId, importSource: MONTHLY_IMPORT_SOURCE } }),
      prisma.fixedAssetImportCandidate.deleteMany({ where: { taxReturnId, status: 'PENDING' } }),
      // Pagos a cuenta de impuesto al cheque creados por esta importación (certificado IDCB-AAAA-MM).
      // Las retenciones cargadas a mano no llevan ese certificado y no se tocan.
      prisma.taxWithholding.deleteMany({
        where: { taxReturnId, taxCode: IDCB_TAX_CODE, certificateNumber: { startsWith: IDCB_CERTIFICATE_PREFIX } },
      }),
      prisma.taxWithholding.createMany({ data: idcb.drafts.map(draft => ({
        taxReturnId,
        agentName: draft.agentName,
        taxCode: draft.taxCode,
        taxDescription: draft.taxDescription,
        date: draft.date,
        certificateNumber: draft.certificateNumber,
        operationDescription: draft.operationDescription,
        amount: draft.amount,
      })) }),
      prisma.salesInvoice.createMany({ data: mapped.sales.map(s => ({ ...s, taxReturnId })) }),
      prisma.purchaseInvoice.createMany({ data: [...mapped.purchases, ...iibbExpenseDrafts].map(p => ({ ...p, taxReturnId })) }),
      // skipDuplicates: un candidato ya procesado (status != PENDING) no se borra arriba; sin esto,
      // recrearlo violaría @@unique(taxReturnId, sourceFiscalDocumentId) y abortaría toda la importación.
      prisma.fixedAssetImportCandidate.createMany({ skipDuplicates: true, data: mapped.fixedAssetCandidates.map(candidate => ({
        taxReturnId,
        sourceFiscalDocumentId: candidate.sourceFiscalDocumentId,
        sourceMonth: candidate.month,
        description: candidate.description,
        counterpartyName: candidate.counterpartyName,
        purchaseDate: candidate.date,
        originalCost: candidate.cost,
      })) }),
      prisma.auditLog.create({ data: {
        action: 'IMPORT',
        entityType: 'TaxReturn',
        entityId: taxReturnId,
        clientCuit: taxReturn.client?.cuit,
        clientName: taxReturn.client?.name,
        fiscalYear: year,
        details: JSON.stringify({
          from: 'libro fiscal mensual (IVA)',
          monthsUsed,
          ...mapped.summary,
          iibbTotal: iibbTotal.toFixed(2),
          idcbMonths: idcb.monthsUsed,
          idcbLoaded: idcb.totalLoaded.toFixed(2),
          idcbComputable: idcb.totalComputable.toFixed(2),
        }),
      } }),
    ]);

    // Snapshot durable (sourceHash) para detectar si la base mensual cambió luego.
    let snapshot: { id: string; confirmed: boolean } | null = null;
    let snapshotError: string | null = null;
    try {
      const assembly = await readAnnualConsolidation(prisma, clientId, year);
      const saved = await persistAnnualConsolidationSnapshot(prisma, taxReturnId, assembly, { confirm: assembly.gate.canConsolidateYear });
      snapshot = { id: saved.id, confirmed: saved.confirmed };
    } catch (error) {
      // el snapshot es complementario; si falla no invalida la importación de registros,
      // pero el usuario debe saber que la red de detección de cambios no quedó armada.
      snapshotError = error instanceof Error ? error.message : String(error);
      console.error(`No se pudo guardar el snapshot de consolidación anual (taxReturn ${taxReturnId}):`, error);
    }

    const notices = buildNotices(mapped.summary, iibbTotal, iibbExpenseDrafts.length);
    const idcbNotice = idcbImportNotice(idcb, uniqueIdcbPercent(idcbEntries));
    if (idcbNotice) notices.push(idcbNotice);
    if (snapshotError) {
      notices.push('La importación se guardó, pero no pudo registrarse el snapshot de consolidación anual: cambios posteriores en el libro mensual no serán detectados automáticamente. Reintentá la importación para regenerarlo.');
    }

    return NextResponse.json({
      success: true,
      data: {
        year,
        monthsUsed,
        summary: mapped.summary,
        fixedAssetCandidates: mapped.fixedAssetCandidates,
        iibbTotal: iibbTotal.toFixed(2),
        idcb: {
          months: idcb.monthsUsed,
          totalLoaded: idcb.totalLoaded.toFixed(2),
          totalComputable: idcb.totalComputable.toFixed(2),
        },
        snapshot,
        notices,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo importar el libro mensual: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}

function buildNotices(summary: { fixedAssetCount: number; pendingReview: number }, iibbTotal: Decimal, iibbMonthsLoaded: number): string[] {
  const notices: string[] = [];
  if (summary.fixedAssetCount > 0) {
    notices.push(`${summary.fixedAssetCount} comprobante(s) de bienes de uso quedaron como candidatos: cargá su vida útil en la sección de amortizaciones.`);
  }
  if (summary.pendingReview > 0) {
    notices.push(`${summary.pendingReview} compra(s) se importaron como gasto deducible por defecto: revisá si alguna es mercadería o bien de uso.`);
  }
  if (iibbMonthsLoaded > 0) {
    notices.push(`IIBB determinado cargado automáticamente como gasto deducible: ${iibbMonthsLoaded} mes(es) por un total de ${iibbTotal.toFixed(2)} (una fila por mes, se reemplazan al reimportar).`);
  }
  return notices;
}
