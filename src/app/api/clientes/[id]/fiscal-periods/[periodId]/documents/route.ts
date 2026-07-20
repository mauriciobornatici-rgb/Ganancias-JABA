export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { parseAfipFiscalLedgerDocuments } from '@/domain/ganancias/mappers/afipFiscalLedgerImporter';
import { persistFiscalDocuments } from '@/domain/ganancias/persistence/fiscalLedgerPersistence';
import { MAX_IMPORT_TOTAL_BYTES } from '@/domain/ganancias/presentation/apiValidation';
import { prisma } from '@/domain/ganancias/prisma';
import type { FiscalDocumentDraft } from '@/domain/ganancias/fiscalLedger/types';
import { buildFiscalPeriodSourceMutationDecision } from '@/domain/ganancias/workflow/fiscalPeriodWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/**
 * Lista los comprobantes cargados en un período, para la grilla de revisión donde el usuario
 * selecciona/deselecciona qué filas entran en la liquidación.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;

  try {
    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, clientId: true, year: true, month: true },
    });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json(
        { success: false, error: 'El período no existe o no pertenece a este contribuyente.' },
        { status: 404 },
      );
    }

    const documents = await prisma.fiscalDocument.findMany({
      where: { fiscalPeriodId: periodId },
      orderBy: [{ direction: 'asc' }, { issueDate: 'asc' }],
      select: {
        id: true,
        direction: true,
        voucherType: true,
        voucherNumber: true,
        issueDate: true,
        counterpartyName: true,
        counterpartyCuit: true,
        netAmount: true,
        totalAmount: true,
        includedInSettlement: true,
        vatLines: { select: { rate: true, vatAmount: true, kind: true, creditComputable: true } },
      },
    });

    const mapped = documents.map(d => ({
      id: d.id,
      direction: d.direction,
      voucherType: d.voucherType,
      voucherNumber: d.voucherNumber,
      issueDate: d.issueDate.toISOString().slice(0, 10),
      counterpartyName: d.counterpartyName,
      counterpartyCuit: d.counterpartyCuit,
      netAmount: d.netAmount.toString(),
      totalAmount: d.totalAmount.toString(),
      vatAmount: d.vatLines.reduce((sum, l) => sum + Number(l.vatAmount), 0).toFixed(2),
      includedInSettlement: d.includedInSettlement,
    }));

    return NextResponse.json({ success: true, data: { period, documents: mapped } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudieron listar los comprobantes: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

/**
 * Importa comprobantes AFIP (ventas y/o compras) a un período mensual del libro fiscal.
 * Reusa el parser CSV ya corregido (Latin-1, separador ';', coma decimal, desglose por alícuota)
 * y la persistencia idempotente (clave de documento + @@unique). Acepta múltiples archivos
 * (los 12 meses se cargan por período; dentro de un mes pueden venir ventas y compras juntas).
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
      return NextResponse.json(
        { success: false, error: 'El período mensual no existe o no pertenece a este contribuyente.' },
        { status: 404 },
      );
    }

    const mutationDecision = buildFiscalPeriodSourceMutationDecision({
      vatStatus: period.vatSettlements[0]?.status,
      grossIncomeStatus: period.grossIncomeSettlements[0]?.status,
    });
    if (!mutationDecision.allowed) {
      return NextResponse.json({ success: false, error: mutationDecision.error }, { status: mutationDecision.httpStatus });
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    const legacyFile = formData.get('file');
    if (legacyFile instanceof File) {
      files.push(legacyFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No se ha subido ningún archivo.' }, { status: 400 });
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `El lote supera el máximo de ${Math.round(MAX_IMPORT_TOTAL_BYTES / (1024 * 1024))} MB. Suba los archivos en tandas más chicas.`,
        },
        { status: 413 },
      );
    }

    const ownerCuit = period.client?.cuit ?? '';
    const documents: FiscalDocumentDraft[] = [];
    const errors: string[] = [];
    const fileResults: Array<{ fileName: string; documents: number; errors: string[] }> = [];

    for (const file of files) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const result = parseAfipFiscalLedgerDocuments({ fileName: file.name, fileBuffer }, { ownerCuit });
      documents.push(...result.documents);
      errors.push(...result.errors);
      fileResults.push({ fileName: file.name, documents: result.documents.length, errors: result.errors });
    }

    if (documents.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se pudo compilar ningún comprobante de los archivos subidos. Verifique que sean exportaciones de "Mis Comprobantes" de ARCA.',
          details: errors,
          fileResults,
        },
        { status: 422 },
      );
    }

    const { inserted, duplicates } = await prisma.$transaction(async tx => {
      const persisted = await persistFiscalDocuments(tx, periodId, documents);
      await tx.auditLog.create({ data: {
        action: 'IMPORT',
        entityType: 'FiscalPeriod',
        entityId: periodId,
        clientCuit: period.client?.cuit,
        clientName: period.client?.name,
        fiscalYear: period.year,
        details: `Importación libro fiscal ${String(period.month).padStart(2, '0')}/${period.year}: ${persisted.inserted} nuevos, ${persisted.duplicates} duplicados omitidos, ${files.length} archivo(s).`,
      } });
      return persisted;
    }, { timeout: 60000, maxWait: 10000 }); // importaciones grandes sobre base remota: nunca el default de 5 s

    return NextResponse.json({
      success: true,
      data: {
        inserted,
        duplicates,
        totalDocuments: documents.length,
        totalFiles: files.length,
        fileResults,
        warnings: errors,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudieron importar los comprobantes: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
