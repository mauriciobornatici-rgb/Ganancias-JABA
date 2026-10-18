export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import { parseMoneyToPlain } from '@/domain/ganancias/presentation/parseMoney';
import {
  computeIdcbComputableAmount,
  IDCB_CREDIT_KEY,
  IDCB_TAX_DESCRIPTION,
  normalizeIdcbComputablePercent,
} from '@/domain/ganancias/fiscalLedger/bankTaxCredit';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/**
 * Impuesto sobre débitos y créditos bancarios (impuesto al cheque) del mes.
 *
 * Se guarda el importe TOTAL del mes (criterio del usuario, 2026-07-24) en un único
 * `TaxCreditRecord` del período con `tax=GANANCIAS` y `kind=PAYMENT_ON_ACCOUNT`. El porcentaje
 * computable (33% o 100%) NO se persiste acá: sale del perfil fiscal del período, así que si el
 * usuario lo corrige, el cómputo se recalcula sin tener que reeditar cada mes.
 *
 * No afecta la liquidación de IVA ni de IIBB: es un pago a cuenta de Ganancias. Por eso se puede
 * cargar y corregir aunque el mes ya esté cerrado en IVA/IIBB (cerrar IVA no es evidencia del
 * impuesto al cheque). Lo que sí queda registrado en auditoría es cada cambio.
 */
const putSchema = z.object({
  amount: z.union([z.string(), z.number(), z.null()]),
  notes: z.string().max(500).optional().nullable(),
});

async function loadPeriod(periodId: string) {
  return prisma.fiscalPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      clientId: true,
      year: true,
      month: true,
      client: { select: { cuit: true, name: true } },
      taxProfile: { select: { idcbComputablePercent: true } },
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;
  try {
    const period = await loadPeriod(periodId);
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const record = await prisma.taxCreditRecord.findUnique({
      where: { fiscalPeriodId_creditKey: { fiscalPeriodId: periodId, creditKey: IDCB_CREDIT_KEY } },
      select: { originalAmount: true, notes: true, updatedAt: true },
    });

    const percent = normalizeIdcbComputablePercent(period.taxProfile?.idcbComputablePercent);
    const total = record ? new Decimal(record.originalAmount.toString()) : new Decimal(0);

    return NextResponse.json({
      success: true,
      data: {
        amount: record ? total.toFixed(2) : '',
        computablePercent: percent,
        computableAmount: computeIdcbComputableAmount(total, percent).toFixed(2),
        notes: record?.notes ?? null,
        updatedAt: record?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo cargar el impuesto al cheque del período: ${messageOf(error)}` }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId, periodId } = await context.params;

  try {
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Importe inválido.' }, { status: 400 });
    }

    const period = await loadPeriod(periodId);
    if (!period || period.clientId !== clientId) {
      return NextResponse.json({ success: false, error: 'El período no existe o no pertenece a este contribuyente.' }, { status: 404 });
    }

    const plain = parseMoneyToPlain(parsed.data.amount);
    const isEmpty = plain === null || plain === '';
    const total = isEmpty ? new Decimal(0) : new Decimal(plain);
    if (!isEmpty && (!total.isFinite() || total.isNegative())) {
      return NextResponse.json(
        { success: false, error: 'El impuesto al cheque del mes debe ser un importe positivo (o vacío para borrarlo).' },
        { status: 400 },
      );
    }

    const percent = normalizeIdcbComputablePercent(period.taxProfile?.idcbComputablePercent);
    const monthLabel = `${String(period.month).padStart(2, '0')}/${period.year}`;

    // Vacío o cero: se borra el registro del mes en vez de dejar un 0 que parece cargado.
    if (isEmpty || total.isZero()) {
      const deleted = await prisma.taxCreditRecord.deleteMany({
        where: { fiscalPeriodId: periodId, creditKey: IDCB_CREDIT_KEY },
      });
      if (deleted.count > 0) {
        await logAuditEvent({
          action: 'DELETE',
          entityType: 'FiscalPeriod',
          entityId: periodId,
          clientCuit: period.client?.cuit,
          clientName: period.client?.name,
          fiscalYear: period.year,
          details: `Impuesto al cheque ${monthLabel}: importe borrado.`,
        });
      }
      return NextResponse.json({
        success: true,
        data: { amount: '', computablePercent: percent, computableAmount: '0.00', notes: null },
      });
    }

    const computable = computeIdcbComputableAmount(total, percent);
    const amountString = total.toFixed(2);
    // Último día del mes: el impuesto al cheque es del período, no de una fecha de comprobante.
    const issueDate = new Date(Date.UTC(period.year, period.month, 0));

    await prisma.taxCreditRecord.upsert({
      where: { fiscalPeriodId_creditKey: { fiscalPeriodId: periodId, creditKey: IDCB_CREDIT_KEY } },
      create: {
        fiscalPeriodId: periodId,
        creditKey: IDCB_CREDIT_KEY,
        tax: 'GANANCIAS',
        kind: 'PAYMENT_ON_ACCOUNT',
        issueDate,
        agentName: IDCB_TAX_DESCRIPTION,
        originalAmount: amountString,
        source: 'MANUAL',
        notes: parsed.data.notes ?? null,
      },
      update: {
        originalAmount: amountString,
        issueDate,
        notes: parsed.data.notes ?? null,
      },
    });

    await logAuditEvent({
      action: 'UPDATE',
      entityType: 'FiscalPeriod',
      entityId: periodId,
      clientCuit: period.client?.cuit,
      clientName: period.client?.name,
      fiscalYear: period.year,
      details: `Impuesto al cheque ${monthLabel}: total $${amountString}, computable ${percent}% = $${computable.toFixed(2)}.`,
    });

    return NextResponse.json({
      success: true,
      data: {
        amount: amountString,
        computablePercent: percent,
        computableAmount: computable.toFixed(2),
        notes: parsed.data.notes ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo guardar el impuesto al cheque: ${messageOf(error)}` }, { status: 500 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
