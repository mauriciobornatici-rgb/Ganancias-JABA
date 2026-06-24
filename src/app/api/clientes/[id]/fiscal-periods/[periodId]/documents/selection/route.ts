export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

const selectionSchema = z.object({
  // Lista de cambios de inclusión: por id de comprobante, si entra o no en la liquidación.
  changes: z
    .array(
      z.object({
        documentId: z.string().min(1),
        included: z.boolean(),
      }),
    )
    .min(1)
    .max(5000),
});

/**
 * Marca/desmarca comprobantes para la liquidación (selección de filas de la grilla de revisión).
 * Los desmarcados quedan en el libro pero NO entran en el cálculo de IVA/IIBB.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;

  try {
    const parsed = selectionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Selección inválida.' }, { status: 400 });
    }

    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, clientId: true },
    });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json(
        { success: false, error: 'El período no existe o no pertenece a este contribuyente.' },
        { status: 404 },
      );
    }

    // Solo se actualizan comprobantes que pertenezcan a este período (defensa contra ids ajenos).
    const ids = parsed.data.changes.map(c => c.documentId);
    const owned = await prisma.fiscalDocument.findMany({
      where: { id: { in: ids }, fiscalPeriodId: periodId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map(d => d.id));

    const includeIds = parsed.data.changes.filter(c => c.included && ownedIds.has(c.documentId)).map(c => c.documentId);
    const excludeIds = parsed.data.changes.filter(c => !c.included && ownedIds.has(c.documentId)).map(c => c.documentId);

    await prisma.$transaction([
      ...(includeIds.length
        ? [prisma.fiscalDocument.updateMany({ where: { id: { in: includeIds } }, data: { includedInSettlement: true } })]
        : []),
      ...(excludeIds.length
        ? [prisma.fiscalDocument.updateMany({ where: { id: { in: excludeIds } }, data: { includedInSettlement: false } })]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      data: { included: includeIds.length, excluded: excludeIds.length, ignored: ids.length - ownedIds.size },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo actualizar la selección: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
