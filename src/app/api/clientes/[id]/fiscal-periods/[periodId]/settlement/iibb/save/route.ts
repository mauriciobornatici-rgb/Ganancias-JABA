export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { buildPeriodGrossIncome } from '@/domain/ganancias/fiscalLedger/grossIncomeFromProfile';
import { persistGrossIncomeSettlement } from '@/domain/ganancias/persistence/fiscalSettlementPersistence';
import { parseMoneyToPlain } from '@/domain/ganancias/presentation/parseMoney';
import type { SettlementDocument } from '@/domain/ganancias/fiscalLedger/settlementBuilders';
import type { GrossIncomeRegime } from '@/domain/ganancias/fiscalLedger/grossIncomeSettlement';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

const decimalString = z.union([z.string(), z.number()]).transform(v => String(v)).optional().nullable();
const saveSchema = z.object({
  official: z.object({ amount: decimalString, reference: z.string().max(200).optional().nullable() }).optional().nullable(),
  forceSave: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

const norm = (v: string | number | null | undefined): string | null => parseMoneyToPlain(v);

/**
 * Guarda la liquidación de IIBB del período. Recalcula del lado servidor (alícuotas/coeficientes del
 * perfil + ventas del período) y coteja el saldo a pagar contra el total oficial. Si coincide → CLOSED
 * (habilita su uso como gasto deducible en Ganancias); si difiere → 409 o IN_REVIEW con forceSave.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId, periodId } = await context.params;
  try {
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Datos de guardado inválidos.' }, { status: 400 });

    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      select: {
        clientId: true, year: true, month: true,
        client: { select: { cuit: true, name: true } },
        taxProfile: { select: { grossIncomeRegime: true, jurisdictions: { select: { jurisdictionCode: true, isActive: true, taxRate: true } } } },
        documents: { where: { includedInSettlement: true }, select: { direction: true, voucherType: true, vatLines: { select: { kind: true, taxableBase: true, rate: true, vatAmount: true, creditComputable: true } } } },
        taxCredits: { where: { includedInSettlement: true }, select: { tax: true, jurisdictionCode: true, originalAmount: true, appliedAmount: true } },
      },
    });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const regime = (period.taxProfile?.grossIncomeRegime ?? 'NONE') as GrossIncomeRegime;
    const activeJurisdictions = (period.taxProfile?.jurisdictions ?? []).filter(j => j.isActive);

    const documents: SettlementDocument[] = period.documents.map(doc => ({
      direction: doc.direction as 'SALE' | 'PURCHASE',
      voucherType: doc.voucherType,
      vatLines: doc.vatLines.map(l => ({
        kind: String(l.kind), taxableBase: new Decimal(l.taxableBase.toString()), rate: new Decimal(l.rate.toString()),
        vatAmount: new Decimal(l.vatAmount.toString()), creditComputable: l.creditComputable,
      })),
    }));

    const coefficientMap = new Map<string, Decimal>();
    if (regime === 'CM_REGIMEN_GENERAL' || regime === 'CM_REGIMEN_ESPECIAL') {
      const version = await prisma.conventionCoefficientVersion.findFirst({
        where: { clientId, year: period.year },
        orderBy: { version: 'desc' },
        select: { coefficientLines: { select: { jurisdictionCode: true, unifiedCoefficient: true } } },
      });
      for (const line of version?.coefficientLines ?? []) coefficientMap.set(line.jurisdictionCode, new Decimal(line.unifiedCoefficient.toString()));
    }

    const giCredits = period.taxCredits
      .filter(c => String(c.tax) === 'GROSS_INCOME')
      .map(c => ({ jurisdictionCode: c.jurisdictionCode, amount: new Decimal(c.originalAmount.toString()).sub(c.appliedAmount.toString()) }));

    const previousPeriod = await prisma.fiscalPeriod.findFirst({
      where: period.month === 1
        ? { clientId, year: period.year - 1, month: 12 }
        : { clientId, year: period.year, month: period.month - 1 },
      select: {
        grossIncomeSettlements: {
          where: { status: 'CLOSED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { jurisdictionLines: { select: { jurisdictionCode: true, favorCarryForward: true } } },
        },
      },
    });
    const previousFavorBalances = new Map(
      (previousPeriod?.grossIncomeSettlements[0]?.jurisdictionLines ?? [])
        .map(line => [line.jurisdictionCode, new Decimal(line.favorCarryForward.toString())] as const),
    );

    const { view, notice } = buildPeriodGrossIncome({
      regime,
      jurisdictions: activeJurisdictions.map(j => ({ jurisdictionCode: j.jurisdictionCode, taxRate: j.taxRate != null ? new Decimal(j.taxRate.toString()) : null })),
      documents,
      coefficientMap,
      credits: giCredits,
      previousFavorBalances,
      year: period.year,
    });

    if (!view) {
      return NextResponse.json({ success: false, error: 'No hay IIBB para liquidar (régimen NONE o sin jurisdicciones configuradas).' }, { status: 400 });
    }

    if (notice && parsed.data.official?.amount != null) {
      return NextResponse.json(
        { success: false, error: `No se puede cerrar IIBB con configuración incompleta. ${notice}` },
        { status: 409 },
      );
    }

    const officialAmount = norm(parsed.data.official?.amount);
    const balanceDue = view.settlement.totalBalanceDue;
    const matches = officialAmount != null && balanceDue.sub(officialAmount).abs().lessThanOrEqualTo('0.01');

    // Para cerrar hace falta cotejar el saldo oficial. Si difiere y no se fuerza → 409.
    if (officialAmount != null && !matches && !parsed.data.forceSave) {
      return NextResponse.json(
        { success: false, error: `El saldo a pagar de IIBB no coincide con el oficial. Calculado ${balanceDue.toFixed(2)} vs ${new Decimal(officialAmount).toFixed(2)}.` },
        { status: 409 },
      );
    }

    const status = officialAmount == null ? 'DRAFT' : matches ? 'CLOSED' : 'IN_REVIEW';

    const saved = await persistGrossIncomeSettlement(prisma, {
      fiscalPeriodId: periodId,
      view,
      status,
      official: { amount: officialAmount, reference: parsed.data.official?.reference ?? null },
      notes: parsed.data.notes ?? null,
    });

    await logAuditEvent({
      action: status === 'CLOSED' ? 'CLOSE' : 'CREATE',
      entityType: 'GrossIncomeSettlement',
      entityId: saved.id,
      clientCuit: period.client?.cuit,
      clientName: period.client?.name,
      fiscalYear: period.year,
      details: JSON.stringify({ period: `${period.year}-${String(period.month).padStart(2, '0')}`, version: saved.version, status, determined: view.settlement.totalDeterminedTax.toFixed(2), balanceDue: balanceDue.toFixed(2), favorCarryForward: view.settlement.totalFavorCarryForward.toFixed(2) }),
    });

    return NextResponse.json({ success: true, data: { id: saved.id, version: saved.version, status: saved.status, totalBalanceDue: balanceDue.toFixed(2), totalFavorCarryForward: view.settlement.totalFavorCarryForward.toFixed(2) } });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo guardar la liquidación de IIBB: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
