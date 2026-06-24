export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import {
  buildVatSettlement,
  type SettlementDocument,
} from '@/domain/ganancias/fiscalLedger/settlementBuilders';
import {
  persistVatSettlement,
  checkVatCotejo,
} from '@/domain/ganancias/persistence/fiscalSettlementPersistence';

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

// Acepta números en formato argentino ("9.090.888,61"), con punto de miles y coma decimal, o
// formato plano ("9090888.61"). La normalización a Decimal se hace después con `norm`.
const toPlain = (v: string): string => v.replace(/\./g, '').replace(',', '.').trim();
const decimalString = z
  .union([z.string(), z.number()])
  .transform(v => String(v))
  .refine(v => v.trim() === '' || !Number.isNaN(Number(toPlain(v))), 'Importe inválido')
  .optional()
  .nullable();

const saveSchema = z.object({
  // Valores oficiales con los que el usuario cotejó contra AFIP (lo que ve en el F2002).
  official: z
    .object({
      debitFiscal: decimalString,
      creditFiscal: decimalString,
      amountDue: decimalString,
      reference: z.string().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
  // Si el usuario confirma guardar aun cuando el cotejo no coincide (queda IN_REVIEW).
  forceSave: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

// Normaliza un importe en formato AR ("9.090.888,61") o plano a string Decimal ("9090888.61").
const norm = (v: string | number | null | undefined): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const plain = toPlain(String(v));
  return plain === '' || Number.isNaN(Number(plain)) ? null : plain;
};

/**
 * Guarda la liquidación de IVA del período tras el cotejo con AFIP.
 *
 * El servidor RECALCULA los totales desde los comprobantes marcados (no confía en números del
 * cliente), coteja contra los valores oficiales que el usuario ingresó, y persiste:
 *  - Si coincide con AFIP → status CLOSED (cotejado): habilita su uso en la liquidación anual.
 *  - Si no coincide y forceSave=false → 409 con el detalle de las diferencias (no guarda).
 *  - Si no coincide y forceSave=true → status IN_REVIEW (guardado con observación).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;

  try {
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos de guardado inválidos.' }, { status: 400 });
    }

    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      include: {
        documents: {
          where: { includedInSettlement: true },
          select: {
            direction: true,
            voucherType: true,
            vatLines: { select: { kind: true, taxableBase: true, rate: true, vatAmount: true, creditComputable: true } },
          },
        },
        taxCredits: {
          where: { includedInSettlement: true },
          select: { tax: true, originalAmount: true, appliedAmount: true },
        },
      },
    });

    if (!period || period.clientId !== clientId) {
      return NextResponse.json(
        { success: false, error: 'El período no existe o no pertenece a este contribuyente.' },
        { status: 404 },
      );
    }

    if (period.documents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay comprobantes seleccionados para liquidar en este período.' },
        { status: 400 },
      );
    }

    const documents: SettlementDocument[] = period.documents.map(doc => ({
      direction: doc.direction as 'SALE' | 'PURCHASE',
      voucherType: doc.voucherType,
      vatLines: doc.vatLines.map(line => ({
        kind: String(line.kind),
        taxableBase: new Decimal(line.taxableBase.toString()),
        rate: new Decimal(line.rate.toString()),
        vatAmount: new Decimal(line.vatAmount.toString()),
        creditComputable: line.creditComputable,
      })),
    }));

    const previousTechnicalBalance = await findPreviousVatTechnicalBalance(clientId, period.year, period.month);
    const previousFreeAvailability = await findPreviousVatFreeAvailability(clientId, period.year, period.month);

    const vatCredits = period.taxCredits
      .filter(c => String(c.tax) === 'VAT')
      .map(c => ({ amount: new Decimal(c.originalAmount.toString()).sub(c.appliedAmount.toString()) }));

    const view = buildVatSettlement({
      documents,
      vatCredits,
      previousTechnicalBalance,
      previousFreeAvailability,
    });

    const official = parsed.data.official
      ? {
          debitFiscal: norm(parsed.data.official.debitFiscal),
          creditFiscal: norm(parsed.data.official.creditFiscal),
          amountDue: norm(parsed.data.official.amountDue),
          reference: parsed.data.official.reference ?? null,
        }
      : null;

    const cotejo = checkVatCotejo(view, official);

    // Cotejo INCOMPLETO: faltan importes oficiales (no se pueden cargar solo 1 o 2 y cerrar).
    // No se permite forzar el cierre con datos parciales; hay que cargar los tres o guardar sin cotejo.
    if (official && !cotejo.complete) {
      return NextResponse.json(
        {
          success: false,
          error: 'Para cerrar la liquidación cargá los tres importes de AFIP (débito, crédito y saldo a pagar).',
          cotejo,
        },
        { status: 409 },
      );
    }

    // Cotejo completo pero con diferencias y sin forzar → no se persiste (se ofrece guardar en revisión).
    if (official && cotejo.complete && !cotejo.matches && !parsed.data.forceSave) {
      return NextResponse.json(
        {
          success: false,
          error: 'Los valores no coinciden con AFIP. Revisá los comprobantes o confirmá el guardado con observación.',
          cotejo,
        },
        { status: 409 },
      );
    }

    const saved = await persistVatSettlement(prisma, {
      fiscalPeriodId: periodId,
      view,
      previousTechnicalBalance,
      official,
      notes: parsed.data.notes ?? null,
    });

    await logAuditEvent({
      action: cotejo.matches ? 'CLOSE' : 'CREATE',
      entityType: 'VatSettlement',
      entityId: saved.id,
      fiscalYear: period.year,
      details: JSON.stringify({
        clientId,
        periodId,
        period: `${period.year}-${String(period.month).padStart(2, '0')}`,
        version: saved.version,
        status: saved.status,
        amountDue: view.settlement.amountDue.toFixed(2),
        cotejoMatches: cotejo.matches,
        diffs: saved.cotejo.diffs,
      }),
    });

    return NextResponse.json({
      success: true,
      data: {
        id: saved.id,
        version: saved.version,
        status: saved.status,
        cotejo: saved.cotejo,
        amountDue: view.settlement.amountDue.toFixed(2),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo guardar la liquidación: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

// El arrastre toma SOLO la última liquidación CLOSED (cotejada) del mes anterior. Un borrador o una
// liquidación en revisión NO contamina el saldo técnico ni la libre disponibilidad del mes siguiente.
async function findPreviousVatTechnicalBalance(clientId: string, year: number, month: number): Promise<Decimal> {
  const { year: prevYear, month: prevMonth } = previousMonth(year, month);
  const prevPeriod = await prisma.fiscalPeriod.findFirst({
    where: { clientId, year: prevYear, month: prevMonth },
    select: { vatSettlements: { where: { status: 'CLOSED' }, orderBy: { version: 'desc' }, take: 1, select: { technicalCarryForward: true } } },
  });
  const carry = prevPeriod?.vatSettlements?.[0]?.technicalCarryForward;
  return carry ? new Decimal(carry.toString()) : new Decimal(0);
}

async function findPreviousVatFreeAvailability(clientId: string, year: number, month: number): Promise<Decimal> {
  const { year: prevYear, month: prevMonth } = previousMonth(year, month);
  const prevPeriod = await prisma.fiscalPeriod.findFirst({
    where: { clientId, year: prevYear, month: prevMonth },
    select: { vatSettlements: { where: { status: 'CLOSED' }, orderBy: { version: 'desc' }, take: 1, select: { freeAvailabilityBalance: true } } },
  });
  const fav = prevPeriod?.vatSettlements?.[0]?.freeAvailabilityBalance;
  return fav ? new Decimal(fav.toString()) : new Decimal(0);
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
