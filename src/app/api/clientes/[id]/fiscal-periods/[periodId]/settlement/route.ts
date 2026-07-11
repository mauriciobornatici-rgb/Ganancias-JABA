export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { prisma } from '@/domain/ganancias/prisma';
import {
  buildVatSettlement,
  buildGrossIncomeSettlement,
  type SettlementDocument,
} from '@/domain/ganancias/fiscalLedger/settlementBuilders';
import { buildPeriodGrossIncome } from '@/domain/ganancias/fiscalLedger/grossIncomeFromProfile';
import type { GrossIncomeRegime } from '@/domain/ganancias/fiscalLedger/grossIncomeSettlement';

/** Carga el mapa de coeficientes unificados CM (CM05) del año, solo si el régimen es Convenio. */
async function loadConventionCoefficients(clientId: string, year: number, regime: GrossIncomeRegime): Promise<Map<string, Decimal>> {
  const map = new Map<string, Decimal>();
  if (regime !== 'CM_REGIMEN_GENERAL' && regime !== 'CM_REGIMEN_ESPECIAL') return map;
  const version = await prisma.conventionCoefficientVersion.findFirst({
    where: { clientId, year },
    orderBy: { version: 'desc' },
    select: { coefficientLines: { select: { jurisdictionCode: true, unifiedCoefficient: true } } },
  });
  for (const line of version?.coefficientLines ?? []) {
    map.set(line.jurisdictionCode, new Decimal(line.unifiedCoefficient.toString()));
  }
  return map;
}

type RouteContext = { params: Promise<{ id: string; periodId: string }> };

/**
 * Calcula (sin persistir) la liquidación de IVA e IIBB de un período mensual, a partir de los
 * comprobantes cargados, las percepciones/retenciones sufridas, el saldo técnico arrastrado del
 * mes anterior y el perfil fiscal vigente. Devuelve los números para la pantalla de liquidación.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId, periodId } = await context.params;

  try {
    const period = await prisma.fiscalPeriod.findUnique({
      where: { id: periodId },
      include: {
        client: { select: { cuit: true, name: true } },
        taxProfile: {
          select: {
            grossIncomeRegime: true,
            jurisdictions: { select: { jurisdictionCode: true, isActive: true, taxRate: true } },
          },
        },
        documents: {
          // Solo los comprobantes que el usuario dejó marcados en la revisión entran en la liquidación.
          where: { includedInSettlement: true },
          select: {
            direction: true,
            voucherType: true,
            vatLines: { select: { kind: true, taxableBase: true, rate: true, vatAmount: true, creditComputable: true } },
          },
        },
        // Solo las retenciones/percepciones marcadas entran; se incluye kind para los subtotales.
        taxCredits: {
          where: { includedInSettlement: true },
          select: { tax: true, kind: true, jurisdictionCode: true, originalAmount: true, appliedAmount: true },
        },
      },
    });

    if (!period || period.clientId !== clientId) {
      return NextResponse.json(
        { success: false, error: 'El período no existe o no pertenece a este contribuyente.' },
        { status: 404 },
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

    // Saldos de IVA arrastrados del mes anterior (técnico y libre disponibilidad). Deben coincidir
    // con lo que aplica el guardado (POST .../settlement/save) para que el preview no difiera.
    const previousVat = await findPreviousVatTechnicalBalance(clientId, period.year, period.month);
    const previousFreeAvailability = await findPreviousVatFreeAvailability(clientId, period.year, period.month);

    const vatCreditRecords = period.taxCredits.filter(c => String(c.tax) === 'VAT');
    const vatCredits = vatCreditRecords.map(c => ({
      amount: new Decimal(c.originalAmount.toString()).sub(c.appliedAmount.toString()),
    }));

    // Subtotales por tipo para mostrar y cotejar contra AFIP (retenciones vs percepciones).
    const sumKind = (k: string) =>
      vatCreditRecords
        .filter(c => String(c.kind) === k)
        .reduce((s, c) => s.add(new Decimal(c.originalAmount.toString())), new Decimal(0));
    const vatCreditsBreakdown = {
      withholding: sumKind('WITHHOLDING').toFixed(2),
      perception: sumKind('PERCEPTION').toFixed(2),
      paymentOnAccount: sumKind('PAYMENT_ON_ACCOUNT').toFixed(2),
      total: vatCredits.reduce((s, c) => s.add(c.amount), new Decimal(0)).toFixed(2),
    };

    const vat = buildVatSettlement({
      documents,
      vatCredits,
      previousTechnicalBalance: previousVat,
      previousFreeAvailability,
    });

    // IIBB: se arma con el helper compartido (mismo cálculo que el guardado). Alícuotas y coeficientes
    // CM vienen del perfil; si faltan, el helper avisa.
    const regime = (period.taxProfile?.grossIncomeRegime ?? 'NONE') as GrossIncomeRegime;
    const activeJurisdictions = (period.taxProfile?.jurisdictions ?? []).filter(j => j.isActive);
    const coefficientMap = await loadConventionCoefficients(clientId, period.year, regime);
    const previousGrossIncomeBalances = await findPreviousGrossIncomeFavorBalances(clientId, period.year, period.month);
    const giCredits = period.taxCredits
      .filter(c => String(c.tax) === 'GROSS_INCOME')
      .map(c => ({ jurisdictionCode: c.jurisdictionCode, amount: new Decimal(c.originalAmount.toString()).sub(c.appliedAmount.toString()) }));

    const { view: grossIncome, notice: grossIncomeNotice } = buildPeriodGrossIncome({
      regime,
      jurisdictions: activeJurisdictions.map(j => ({
        jurisdictionCode: j.jurisdictionCode,
        taxRate: j.taxRate != null ? new Decimal(j.taxRate.toString()) : null,
      })),
      documents,
      coefficientMap,
      credits: giCredits,
      previousFavorBalances: previousGrossIncomeBalances,
      year: period.year,
    });

    return NextResponse.json({
      success: true,
      data: {
        period: { id: period.id, year: period.year, month: period.month, client: period.client },
        vat: serializeVat(vat),
        vatCredits: vatCreditsBreakdown,
        grossIncome: grossIncome ? serializeGrossIncome(grossIncome) : null,
        grossIncomeNotice,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo calcular la liquidación: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

async function findPreviousVatTechnicalBalance(clientId: string, year: number, month: number): Promise<Decimal> {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  // Solo arrastra desde la última liquidación CLOSED (cotejada) del mes anterior.
  const prevPeriod = await prisma.fiscalPeriod.findFirst({
    where: { clientId, year: prevYear, month: prevMonth },
    select: {
      vatSettlements: {
        where: { status: 'CLOSED' },
        orderBy: { version: 'desc' },
        take: 1,
        select: { technicalCarryForward: true },
      },
    },
  });
  const carry = prevPeriod?.vatSettlements?.[0]?.technicalCarryForward;
  return carry ? new Decimal(carry.toString()) : new Decimal(0);
}

async function findPreviousVatFreeAvailability(clientId: string, year: number, month: number): Promise<Decimal> {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevPeriod = await prisma.fiscalPeriod.findFirst({
    where: { clientId, year: prevYear, month: prevMonth },
    select: { vatSettlements: { where: { status: 'CLOSED' }, orderBy: { version: 'desc' }, take: 1, select: { freeAvailabilityBalance: true } } },
  });
  const fav = prevPeriod?.vatSettlements?.[0]?.freeAvailabilityBalance;
  return fav ? new Decimal(fav.toString()) : new Decimal(0);
}

async function findPreviousGrossIncomeFavorBalances(clientId: string, year: number, month: number): Promise<Map<string, Decimal>> {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevPeriod = await prisma.fiscalPeriod.findFirst({
    where: { clientId, year: prevYear, month: prevMonth },
    select: {
      grossIncomeSettlements: {
        where: { status: 'CLOSED' },
        orderBy: { version: 'desc' },
        take: 1,
        select: { jurisdictionLines: { select: { jurisdictionCode: true, favorCarryForward: true } } },
      },
    },
  });
  return new Map(
    (prevPeriod?.grossIncomeSettlements[0]?.jurisdictionLines ?? [])
      .map(line => [line.jurisdictionCode, new Decimal(line.favorCarryForward.toString())] as const),
  );
}

function serializeVat(view: ReturnType<typeof buildVatSettlement>) {
  const s = view.settlement;
  return {
    debitFiscal: s.debitFiscal.toFixed(2),
    creditFiscal: s.creditFiscal.toFixed(2),
    technicalBalance: s.technicalBalance.toFixed(2),
    technicalDue: s.technicalDue.toFixed(2),
    technicalCarryForward: s.technicalCarryForward.toFixed(2),
    creditsApplied: s.creditsApplied.toFixed(2),
    amountDue: s.amountDue.toFixed(2),
    freeAvailabilityBalance: s.freeAvailabilityBalance.toFixed(2),
    debitByRate: view.debitByRate.map(r => ({ rate: r.rate, taxableBase: r.taxableBase.toFixed(2), vatAmount: r.vatAmount.toFixed(2) })),
    creditByRate: view.creditByRate.map(r => ({ rate: r.rate, taxableBase: r.taxableBase.toFixed(2), vatAmount: r.vatAmount.toFixed(2), computable: r.computable })),
  };
}

function serializeGrossIncome(view: ReturnType<typeof buildGrossIncomeSettlement>) {
  const s = view.settlement;
  return {
    regime: s.regime,
    taxableBase: view.taxableBase.toFixed(2),
    totalDeterminedTax: s.totalDeterminedTax.toFixed(2),
    totalCreditsApplied: s.totalCreditsApplied.toFixed(2),
    totalBalanceDue: s.totalBalanceDue.toFixed(2),
    totalFavorCarryForward: s.totalFavorCarryForward.toFixed(2),
    jurisdictionLines: s.jurisdictionLines.map(l => ({
      jurisdictionCode: l.jurisdictionCode,
      assignedBase: l.assignedBase.toFixed(2),
      taxRate: l.taxRate.toFixed(6),
      determinedTax: l.determinedTax.toFixed(2),
      creditsApplied: l.creditsApplied.toFixed(2),
      balanceDue: l.balanceDue.toFixed(2),
      favorCarryForward: l.favorCarryForward.toFixed(2),
    })),
    warnings: s.warnings,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
