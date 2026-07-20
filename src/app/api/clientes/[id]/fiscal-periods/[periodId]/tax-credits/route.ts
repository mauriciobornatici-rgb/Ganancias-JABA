export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { parseAfipTaxCredits, type TaxCreditDraft } from '@/domain/ganancias/mappers/afipTaxCreditImporter';
import { persistTaxCredits } from '@/domain/ganancias/persistence/taxCreditPersistence';
import { MAX_IMPORT_TOTAL_BYTES } from '@/domain/ganancias/presentation/apiValidation';
import { prisma } from '@/domain/ganancias/prisma';
import { buildFiscalPeriodSourceMutationDecision } from '@/domain/ganancias/workflow/fiscalPeriodWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/** Lista las retenciones/percepciones cargadas en el período, para la grilla de revisión. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;
  try {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: periodId }, select: { id: true, clientId: true } });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const records = await prisma.taxCreditRecord.findMany({
      where: { fiscalPeriodId: periodId, tax: 'VAT' },
      orderBy: [{ kind: 'asc' }, { issueDate: 'asc' }],
      select: {
        id: true, kind: true, agentCuit: true, certificateNumber: true, issueDate: true,
        originalAmount: true, includedInSettlement: true, notes: true,
      },
    });

    const mapped = records.map(r => ({
      id: r.id,
      kind: r.kind,
      agentCuit: r.agentCuit,
      certificateNumber: r.certificateNumber,
      issueDate: r.issueDate.toISOString().slice(0, 10),
      amount: r.originalAmount.toString(),
      includedInSettlement: r.includedInSettlement,
      notes: r.notes,
    }));

    return NextResponse.json({ success: true, data: { credits: mapped } });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudieron listar las retenciones/percepciones: ${messageOf(error)}` }, { status: 500 });
  }
}

/**
 * Importa el archivo de Retenciones y Percepciones de AFIP (un solo CSV, ret. y perc. mezcladas).
 * Toma solo IVA (767), imputa por Fecha Ret./Perc. validando el mes del período, y persiste de forma
 * idempotente. Estos créditos los aplica el motor de IVA (Art. 24) contra el saldo a ingresar.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId, periodId } = await context.params;

  try {
    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      select: {
        id: true,
        clientId: true,
        year: true,
        month: true,
        client: { select: { cuit: true, name: true } },
        vatSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
        grossIncomeSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
      },
    });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const mutationDecision = buildFiscalPeriodSourceMutationDecision({
      vatStatus: period.vatSettlements[0]?.status,
      grossIncomeStatus: period.grossIncomeSettlements[0]?.status,
    });
    if (!mutationDecision.allowed) {
      return NextResponse.json({ success: false, error: mutationDecision.error }, { status: mutationDecision.httpStatus });
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((v): v is File => v instanceof File);
    const legacy = formData.get('file');
    if (legacy instanceof File) files.push(legacy);
    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No se ha subido ningún archivo.' }, { status: 400 });
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera el máximo permitido.' }, { status: 413 });
    }

    const all: TaxCreditDraft[] = [];
    let ignoredOtherTax = 0;
    const outOfPeriod: Array<{ certificateNumber: string; date: string; amount: string; kind: string }> = [];
    const errors: string[] = [];
    let withholding = 0;
    let perception = 0;

    for (const file of files) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const r = parseAfipTaxCredits({ fileName: file.name, fileBuffer }, { periodYear: period.year, periodMonth: period.month });
      all.push(...r.credits);
      ignoredOtherTax += r.ignoredOtherTax;
      outOfPeriod.push(...r.outOfPeriod);
      errors.push(...r.errors);
      withholding += Number(r.totals.withholding);
      perception += Number(r.totals.perception);
    }

    if (all.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se compiló ninguna retención/percepción de IVA del mes liquidado. Verificá que el archivo sea el de "Mis Retenciones" de ARCA y que las fechas correspondan al período.',
          details: { ignoredOtherTax, outOfPeriod, errors },
        },
        { status: 422 },
      );
    }

    const { inserted, duplicates } = await prisma.$transaction(async tx => {
      const persisted = await persistTaxCredits(tx, periodId, all);
      await tx.auditLog.create({ data: {
        action: 'IMPORT',
        entityType: 'FiscalPeriod',
        entityId: periodId,
        clientCuit: period.client?.cuit,
        clientName: period.client?.name,
        fiscalYear: period.year,
        details: `Importación ret/perc IVA ${String(period.month).padStart(2, '0')}/${period.year}: ${persisted.inserted} nuevas, ${persisted.duplicates} duplicadas, ${outOfPeriod.length} fuera de período, ${ignoredOtherTax} de otros impuestos.`,
      } });
      return persisted;
    }, { timeout: 60000, maxWait: 10000 }); // importaciones grandes sobre base remota: nunca el default de 5 s

    return NextResponse.json({
      success: true,
      data: {
        inserted,
        duplicates,
        ignoredOtherTax,
        outOfPeriod,
        errors,
        totals: { withholding: withholding.toFixed(2), perception: perception.toFixed(2), net: (withholding + perception).toFixed(2) },
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo importar el archivo de retenciones/percepciones: ${messageOf(error)}` }, { status: 500 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
