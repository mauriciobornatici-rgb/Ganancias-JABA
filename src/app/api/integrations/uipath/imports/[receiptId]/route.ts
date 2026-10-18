export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUiPathIntegrationAuth } from '@/domain/ganancias/auth/integrationAuth';
import { prisma } from '@/domain/ganancias/prisma';

type RouteContext = { params: Promise<{ receiptId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = requireUiPathIntegrationAuth(request);
  if (authError) return authError;
  const { receiptId } = await context.params;
  // Tras un timeout UiPath no conoce el receiptId pero si su clave idempotente:
  // se resuelve por cualquiera de las dos (ambas son unicas).
  const receipt =
    (await prisma.externalImportReceipt.findUnique({ where: { id: receiptId } })) ??
    (await prisma.externalImportReceipt.findUnique({ where: { idempotencyKey: receiptId } }));
  if (!receipt) {
    return NextResponse.json({ success: false, error: 'Recibo de importacion inexistente.' }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: {
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
    },
  });
}
