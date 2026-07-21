export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/**
 * Devuelve la ÚLTIMA liquidación de IVA guardada del período (si existe), para que al volver a un mes
 * ya cerrado la pantalla muestre el resultado guardado en vez de obligar a recalcular y recotejar.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;
  try {
    const period = await prisma.fiscalPeriod.findUnique({ where: { id: periodId }, select: { id: true, clientId: true } });
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const settlement = await prisma.vatSettlement.findFirst({
      where: { fiscalPeriodId: periodId },
      orderBy: { version: 'desc' },
      select: {
        id: true, version: true, status: true,
        previousTechnicalBalance: true, previousFreeAvailabilityBalance: true,
        debitFiscal: true, creditFiscal: true, technicalDueBeforeBenefit: true,
        smallTaxpayerBenefitRate: true, smallTaxpayerBenefitReduction: true,
        technicalCarryForward: true, freeAvailabilityBalance: true, amountDue: true,
        officialAmount: true, officialReference: true, filedAt: true, updatedAt: true,
        lines: { select: { concept: true, rate: true, amount: true, sourceReference: true } },
      },
    });

    if (!settlement) {
      return NextResponse.json({ success: true, data: { saved: null } });
    }

    const creditsApplied = settlement.lines
      .filter(l => l.concept === 'PERCEP_RET_APLICADAS')
      .reduce((s, l) => s + Number(l.amount), 0);

    return NextResponse.json({
      success: true,
      data: {
        saved: {
          id: settlement.id,
          version: settlement.version,
          status: settlement.status,
          previousTechnicalBalance: settlement.previousTechnicalBalance.toFixed(2),
          previousFreeAvailabilityBalance: settlement.previousFreeAvailabilityBalance.toFixed(2),
          debitFiscal: settlement.debitFiscal.toFixed(2),
          creditFiscal: settlement.creditFiscal.toFixed(2),
          technicalDueBeforeBenefit: settlement.technicalDueBeforeBenefit.toFixed(2),
          smallTaxpayerBenefitRate: settlement.smallTaxpayerBenefitRate.toFixed(6),
          smallTaxpayerBenefitReduction: settlement.smallTaxpayerBenefitReduction.toFixed(2),
          technicalCarryForward: settlement.technicalCarryForward.toFixed(2),
          freeAvailabilityBalance: settlement.freeAvailabilityBalance.toFixed(2),
          amountDue: settlement.amountDue.toFixed(2),
          creditsApplied: creditsApplied.toFixed(2),
          officialAmount: settlement.officialAmount != null ? settlement.officialAmount.toFixed(2) : null,
          officialReference: settlement.officialReference,
          filedAt: settlement.filedAt ? settlement.filedAt.toISOString() : null,
          updatedAt: settlement.updatedAt.toISOString(),
          lines: settlement.lines.map(l => ({
            concept: l.concept,
            rate: l.rate != null ? l.rate.toString() : null,
            amount: l.amount.toFixed(2),
            sourceReference: l.sourceReference,
          })),
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo cargar la liquidación guardada: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
