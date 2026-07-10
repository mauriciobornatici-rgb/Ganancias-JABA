export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { buildFiscalPeriodSourceMutationDecision } from '@/domain/ganancias/workflow/fiscalPeriodWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

const selectionSchema = z.object({
  changes: z.array(z.object({ creditId: z.string().min(1), included: z.boolean() })).min(1).max(5000),
});

/** Marca/desmarca retenciones/percepciones para la liquidación (grilla de revisión). */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId, periodId } = await context.params;
  try {
    const parsed = selectionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Selección inválida.' }, { status: 400 });
    }

    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      select: {
        id: true,
        clientId: true,
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

    const ids = parsed.data.changes.map(c => c.creditId);
    const owned = await prisma.taxCreditRecord.findMany({
      where: { id: { in: ids }, fiscalPeriodId: periodId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map(c => c.id));

    const includeIds = parsed.data.changes.filter(c => c.included && ownedIds.has(c.creditId)).map(c => c.creditId);
    const excludeIds = parsed.data.changes.filter(c => !c.included && ownedIds.has(c.creditId)).map(c => c.creditId);

    await prisma.$transaction([
      ...(includeIds.length ? [prisma.taxCreditRecord.updateMany({ where: { id: { in: includeIds } }, data: { includedInSettlement: true } })] : []),
      ...(excludeIds.length ? [prisma.taxCreditRecord.updateMany({ where: { id: { in: excludeIds } }, data: { includedInSettlement: false } })] : []),
    ]);

    return NextResponse.json({ success: true, data: { included: includeIds.length, excluded: excludeIds.length } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo actualizar la selección: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
