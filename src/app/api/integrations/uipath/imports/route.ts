export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/client/client';
import { requireUiPathIntegrationAuth } from '@/domain/ganancias/auth/integrationAuth';
import {
  prepareUiPathFiscalImport,
  readUiPathImportFiles,
} from '@/domain/ganancias/integrations/uipathFiscalImport';
import {
  FiscalDocumentImportConflictError,
  persistFiscalDocumentsInsertOnly,
} from '@/domain/ganancias/persistence/fiscalLedgerPersistence';
import { buildFiscalPeriodSourceMutationDecision } from '@/domain/ganancias/workflow/fiscalPeriodWorkflow';
import { prisma } from '@/domain/ganancias/prisma';

export async function POST(request: NextRequest) {
  const authError = requireUiPathIntegrationAuth(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const cuit = String(formData.get('cuit') ?? '');
    const period = String(formData.get('periodo') ?? '');
    const files = await readUiPathImportFiles(formData);
    const prepared = await prepareUiPathFiscalImport({ ownerCuit: cuit, period, files });
    if (!prepared.canImport || !prepared.client || !prepared.taxProfileId) {
      return NextResponse.json(
        { success: false, error: 'La vista previa bloqueo la importacion.', details: prepared.errors },
        { status: 422 },
      );
    }

    const prior = await prisma.externalImportReceipt.findUnique({
      where: { idempotencyKey: prepared.idempotencyKey },
    });
    if (prior) return NextResponse.json({ success: true, replayed: true, data: serializeReceipt(prior) });

    const receipt = await prisma.$transaction(async tx => {
      const existingReceipt = await tx.externalImportReceipt.findUnique({
        where: { idempotencyKey: prepared.idempotencyKey },
      });
      if (existingReceipt) return existingReceipt;

      let fiscalPeriodId = prepared.fiscalPeriodId;
      if (!fiscalPeriodId) {
        const created = await tx.fiscalPeriod.create({
          data: {
            clientId: prepared.client!.id,
            taxProfileId: prepared.taxProfileId!,
            year: prepared.year,
            month: prepared.month,
          },
          select: { id: true },
        });
        fiscalPeriodId = created.id;
      } else {
        const current = await tx.fiscalPeriod.findUnique({
          where: { id: fiscalPeriodId },
          select: {
            vatSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
            grossIncomeSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
          },
        });
        if (!current) throw new Error('El periodo fiscal dejo de existir antes de confirmar la carga.');
        const decision = buildFiscalPeriodSourceMutationDecision({
          vatStatus: current.vatSettlements[0]?.status,
          grossIncomeStatus: current.grossIncomeSettlements[0]?.status,
        });
        if (!decision.allowed) throw new Error(decision.error);
      }

      const persisted = await persistFiscalDocumentsInsertOnly(tx, fiscalPeriodId, prepared.documents);
      const status = persisted.inserted === 0 ? 'NO_CHANGES' : 'CONFIRMED';
      const createdReceipt = await tx.externalImportReceipt.create({
        data: {
          idempotencyKey: prepared.idempotencyKey,
          clientId: prepared.client!.id,
          fiscalPeriodId,
          ownerCuit: prepared.ownerCuit,
          year: prepared.year,
          month: prepared.month,
          status,
          fileManifest: prepared.manifest,
          inserted: persisted.inserted,
          duplicates: persisted.duplicates,
          conflicts: persisted.conflicts,
          totalDocuments: prepared.documents.length,
          warnings: [],
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'IMPORT',
          entityType: 'ExternalImportReceipt',
          entityId: createdReceipt.id,
          clientCuit: prepared.client!.cuit,
          clientName: prepared.client!.name,
          fiscalYear: prepared.year,
          details: JSON.stringify({
            source: 'UIPATH',
            period: `${prepared.year}-${String(prepared.month).padStart(2, '0')}`,
            inserted: persisted.inserted,
            duplicates: persisted.duplicates,
            files: prepared.manifest.map(file => ({ fileName: file.fileName, fileHash: file.fileHash })),
          }),
        },
      });
      return createdReceipt;
    }, { timeout: 60000, maxWait: 10000 });

    return NextResponse.json({ success: true, replayed: false, data: serializeReceipt(receipt) });
  } catch (error) {
    if (error instanceof FiscalDocumentImportConflictError) {
      return NextResponse.json(
        { success: false, error: error.message, conflictKeys: error.conflictKeys },
        { status: 409 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'La misma entrega se proceso en paralelo. Consulte su recibo antes de reintentar.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

function serializeReceipt(receipt: {
  id: string;
  idempotencyKey: string;
  fiscalPeriodId: string;
  ownerCuit: string;
  year: number;
  month: number;
  status: string;
  inserted: number;
  duplicates: number;
  conflicts: number;
  totalDocuments: number;
  createdAt: Date;
}) {
  return {
    receiptId: receipt.id,
    idempotencyKey: receipt.idempotencyKey,
    fiscalPeriodId: receipt.fiscalPeriodId,
    ownerCuit: receipt.ownerCuit,
    period: `${receipt.year}${String(receipt.month).padStart(2, '0')}`,
    status: receipt.status,
    inserted: receipt.inserted,
    duplicates: receipt.duplicates,
    conflicts: receipt.conflicts,
    totalDocuments: receipt.totalDocuments,
    confirmedAt: receipt.createdAt.toISOString(),
  };
}
