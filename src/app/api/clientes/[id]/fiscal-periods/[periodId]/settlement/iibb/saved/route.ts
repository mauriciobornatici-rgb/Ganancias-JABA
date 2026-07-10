export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/** Devuelve la última liquidación de IIBB guardada del período (si existe). */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;
  try {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: periodId }, select: { id: true, clientId: true } });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const s = await prisma.grossIncomeSettlement.findFirst({
      where: { fiscalPeriodId: periodId },
      orderBy: { version: 'desc' },
      select: {
        id: true, version: true, status: true, regime: true,
        totalDeterminedTax: true, totalCredits: true, totalBalance: true, totalFavorCarryForward: true,
        officialAmount: true, officialReference: true, filedAt: true, updatedAt: true,
        jurisdictionLines: { select: { jurisdictionCode: true, coefficient: true, assignedBase: true, taxRate: true, determinedTax: true, creditsApplied: true, balance: true, favorCarryForward: true } },
      },
    });

    if (!s) return NextResponse.json({ success: true, data: { saved: null } });

    return NextResponse.json({
      success: true,
      data: {
        saved: {
          id: s.id,
          version: s.version,
          status: s.status,
          regime: s.regime,
          totalDeterminedTax: s.totalDeterminedTax.toFixed(2),
          totalCredits: s.totalCredits.toFixed(2),
          totalBalance: s.totalBalance.toFixed(2),
          totalFavorCarryForward: s.totalFavorCarryForward.toFixed(2),
          officialAmount: s.officialAmount != null ? s.officialAmount.toFixed(2) : null,
          officialReference: s.officialReference,
          filedAt: s.filedAt ? s.filedAt.toISOString() : null,
          updatedAt: s.updatedAt.toISOString(),
          jurisdictionLines: s.jurisdictionLines.map(l => ({
            jurisdictionCode: l.jurisdictionCode,
            coefficient: l.coefficient != null ? l.coefficient.toString() : null,
            assignedBase: l.assignedBase.toFixed(2),
            taxRate: l.taxRate.toFixed(6),
            determinedTax: l.determinedTax.toFixed(2),
            creditsApplied: l.creditsApplied.toFixed(2),
            balance: l.balance.toFixed(2),
            favorCarryForward: l.favorCarryForward.toFixed(2),
          })),
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo cargar la liquidación de IIBB guardada: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
