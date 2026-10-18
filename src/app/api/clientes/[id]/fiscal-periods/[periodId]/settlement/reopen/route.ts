export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { buildSettlementReopenPlan } from '@/domain/ganancias/workflow/fiscalPeriodWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/**
 * Reabre para rectificación las liquidaciones CERRADAS del período (IVA y/o IIBB):
 * pasan a IN_REVIEW, con nota y auditoría. Con eso el guard de mutación vuelve a
 * permitir cargar comprobantes y créditos. Al re-guardar se crea una versión nueva
 * (no se pisa la historia); el filedAt original queda como evidencia del cierre previo.
 * Idempotente: si no hay nada cerrado responde éxito sin cambios.
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
        vatSettlements: { orderBy: { version: 'desc' }, take: 1, select: { id: true, status: true, notes: true, version: true } },
        grossIncomeSettlements: { orderBy: { version: 'desc' }, take: 1, select: { id: true, status: true, notes: true, version: true } },
      },
    });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const vat = period.vatSettlements[0];
    const grossIncome = period.grossIncomeSettlements[0];
    const plan = buildSettlementReopenPlan({ vatStatus: vat?.status, grossIncomeStatus: grossIncome?.status });
    const reopened: string[] = [];
    const today = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    const reopenNote = (notes: string | null) => `${notes ? `${notes}\n` : ''}[Reabierta para rectificación el ${today}]`;

    await prisma.$transaction(async tx => {
      if (plan.reopenVat && vat) {
        await tx.vatSettlement.update({ where: { id: vat.id }, data: { status: 'IN_REVIEW', notes: reopenNote(vat.notes) } });
        reopened.push('IVA');
      }
      if (plan.reopenGrossIncome && grossIncome) {
        await tx.grossIncomeSettlement.update({ where: { id: grossIncome.id }, data: { status: 'IN_REVIEW', notes: reopenNote(grossIncome.notes) } });
        reopened.push('IIBB');
      }
      if (reopened.length > 0) {
        await tx.auditLog.create({ data: {
          action: 'REOPEN',
          entityType: 'FiscalPeriod',
          entityId: periodId,
          clientCuit: period.client?.cuit,
          clientName: period.client?.name,
          fiscalYear: period.year,
          details: `Reapertura para rectificación de ${reopened.join(' e ')} ${String(period.month).padStart(2, '0')}/${period.year} (versiones: IVA v${vat?.version ?? '-'}, IIBB v${grossIncome?.version ?? '-'}). El nuevo cierre se guardará como versión+1.`,
        } });
      }
    });

    return NextResponse.json({ success: true, data: { reopened } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo reabrir la liquidación: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
