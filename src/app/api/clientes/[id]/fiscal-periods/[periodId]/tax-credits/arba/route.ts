export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  parseArbaDeducciones,
  readArbaDeduccionesFiles,
  type ArbaImportFile,
} from '@/domain/ganancias/mappers/arbaDeduccionesImporter';
import { persistTaxCredits } from '@/domain/ganancias/persistence/taxCreditPersistence';
import { MAX_IMPORT_TOTAL_BYTES } from '@/domain/ganancias/presentation/apiValidation';
import { prisma } from '@/domain/ganancias/prisma';
import { buildFiscalPeriodSourceMutationDecision } from '@/domain/ganancias/workflow/fiscalPeriodWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/**
 * Importa las deducciones de IIBB de ARBA ("Mis Deducciones"): el ZIP tal como se
 * descarga (IB-CUIT-PERIODO.zip) o sus TXT sueltos. Persiste de forma idempotente como
 * TaxCreditRecord (tax=GROSS_INCOME, jurisdicción 902); el motor de IIBB las descuenta
 * del saldo a pagar y la grilla permite excluir líneas antes de liquidar.
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
    const uploads = formData.getAll('files').filter((v): v is File => v instanceof File);
    const legacy = formData.get('file');
    if (legacy instanceof File) uploads.push(legacy);
    if (uploads.length === 0) {
      return NextResponse.json({ success: false, error: 'No se ha subido ningún archivo.' }, { status: 400 });
    }

    const totalBytes = uploads.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
      return NextResponse.json({ success: false, error: 'El archivo supera el máximo permitido.' }, { status: 413 });
    }

    const files: ArbaImportFile[] = await Promise.all(
      uploads.map(async f => ({ fileName: f.name, fileBuffer: Buffer.from(await f.arrayBuffer()) })),
    );
    const { entries, errors: fileErrors } = await readArbaDeduccionesFiles(files);
    const parsed = parseArbaDeducciones(entries, { periodYear: period.year, periodMonth: period.month });
    const errors = [...fileErrors, ...parsed.errors];

    if (parsed.credits.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se compiló ninguna deducción de IIBB del mes liquidado. Verificá que el archivo sea el ZIP de "Mis Deducciones" de ARBA (o sus TXT) y que las fechas correspondan al período.',
          details: { outOfPeriod: parsed.outOfPeriod, unsupportedFiles: parsed.unsupportedFiles, errors },
        },
        { status: 422 },
      );
    }

    const { inserted, duplicates } = await prisma.$transaction(async tx => {
      const persisted = await persistTaxCredits(tx, periodId, parsed.credits);
      await tx.auditLog.create({ data: {
        action: 'IMPORT',
        entityType: 'FiscalPeriod',
        entityId: periodId,
        clientCuit: period.client?.cuit,
        clientName: period.client?.name,
        fiscalYear: period.year,
        details: `Importación deducciones ARBA IIBB ${String(period.month).padStart(2, '0')}/${period.year}: ${persisted.inserted} nuevas, ${persisted.duplicates} duplicadas, ${parsed.outOfPeriod.length} fuera de período, ${errors.length} errores de formato. Bancarias ${parsed.totals.bank}, tarjetas ${parsed.totals.cards}, percepciones ${parsed.totals.perceptions}.`,
      } });
      return persisted;
    }, { timeout: 60000, maxWait: 10000 }); // importaciones sobre base remota: nunca el default de 5 s

    return NextResponse.json({
      success: true,
      data: {
        inserted,
        duplicates,
        outOfPeriod: parsed.outOfPeriod,
        unsupportedFiles: parsed.unsupportedFiles,
        errors,
        totals: parsed.totals,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo importar el archivo de deducciones de ARBA: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
