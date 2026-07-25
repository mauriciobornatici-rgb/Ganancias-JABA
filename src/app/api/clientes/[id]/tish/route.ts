export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import {
  calculateTishYear,
  defaultTishParameters,
  normalizeTishCategory,
  parseTishDueDates,
  serializeTishDueDates,
  TISH_DUE_DATES_2026,
  type TishMonthlyActivityBase,
  type TishParameters,
} from '@/domain/ganancias/fiscalLedger/tish';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Tasa por Inspección de Seguridad e Higiene (TISH) - punto 2 del PDF (2026-07-24).
 *
 * Alcance: solo Régimen General (responsable inscripto). La alícuota y la categoría L/M/N son
 * manuales por cliente y por año; los importes de la ordenanza quedan como parámetros editables.
 *
 * La base sale de la base imponible de IIBB de las líneas de actividad marcadas con "computa TISH"
 * en la configuración de IIBB, acumulada por bimestre. No se adivina la actividad por texto.
 */
const fraction = z.union([z.string(), z.number()]).transform(v => Number(String(v).replace(',', '.')))
  .refine(n => Number.isFinite(n) && n >= 0 && n <= 1, 'Use una fracción entre 0 y 1 (ej. 0.006 = 0,6%).');
const money = z.union([z.string(), z.number()]).transform(v => Number(String(v).replace(',', '.')))
  .refine(n => Number.isFinite(n) && n >= 0, 'Importe inválido.');

const putSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  category: z.enum(['L', 'M', 'N']),
  taxRate: fraction,
  minimumQuota: money,
  categoryAQuota: money,
  healthRate: fraction,
  firefightersRate: fraction,
  wasteRateCategoryL: fraction,
  wasteRateCategoryM: fraction,
  wasteRateCategoryN: fraction,
  dueDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(6).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

type TishSettingRow = {
  category: string;
  taxRate: Decimal | { toString(): string };
  minimumQuota: Decimal | { toString(): string };
  categoryAQuota: Decimal | { toString(): string };
  healthRate: Decimal | { toString(): string };
  firefightersRate: Decimal | { toString(): string };
  wasteRateCategoryL: Decimal | { toString(): string };
  wasteRateCategoryM: Decimal | { toString(): string };
  wasteRateCategoryN: Decimal | { toString(): string };
  dueDates: string | null;
  notes: string | null;
};

function parametersOf(setting: TishSettingRow | null): TishParameters {
  if (!setting) return defaultTishParameters();
  return {
    minimumQuota: new Decimal(setting.minimumQuota.toString()),
    categoryAQuota: new Decimal(setting.categoryAQuota.toString()),
    healthRate: new Decimal(setting.healthRate.toString()),
    firefightersRate: new Decimal(setting.firefightersRate.toString()),
    wasteRateByCategory: {
      L: new Decimal(setting.wasteRateCategoryL.toString()),
      M: new Decimal(setting.wasteRateCategoryM.toString()),
      N: new Decimal(setting.wasteRateCategoryN.toString()),
    },
  };
}

/** Devuelve la configuración del año y la liquidación de los 6 bimestres. */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  const year = Number(request.nextUrl.searchParams.get('year')) || new Date().getFullYear();

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, cuit: true } });
    if (!client) return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });

    const profile = await prisma.clientTaxProfileVersion.findFirst({
      where: { clientId },
      orderBy: { validFrom: 'desc' },
      select: {
        vatCondition: true,
        grossIncomeRegime: true,
        jurisdictions: {
          select: { jurisdictionCode: true, activityCode: true, activityLabel: true, computesTish: true, isActive: true },
          orderBy: [{ jurisdictionCode: 'asc' }, { activityCode: 'asc' }],
        },
      },
    });

    const setting = await prisma.tishSetting.findUnique({
      where: { clientId_year: { clientId, year } },
    });

    const parameters = parametersOf(setting);
    const category = normalizeTishCategory(setting?.category);
    const taxRate = setting ? new Decimal(setting.taxRate.toString()) : new Decimal(0);
    const dueDates = setting?.dueDates ? parseTishDueDates(setting.dueDates) : [...TISH_DUE_DATES_2026];

    // Actividades marcadas: sin tilde no hay base (decisión del usuario, nunca por texto).
    const markedActivities = (profile?.jurisdictions ?? []).filter(j => j.isActive && j.computesTish);

    // Bases mensuales de IIBB: última versión de la liquidación de cada período del año.
    const periods = await prisma.fiscalPeriod.findMany({
      where: { clientId, year },
      orderBy: { month: 'asc' },
      select: {
        month: true,
        grossIncomeSettlements: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            status: true,
            jurisdictionLines: { select: { jurisdictionCode: true, activityCode: true, assignedBase: true } },
          },
        },
      },
    });

    const markedKeys = new Set(markedActivities.map(a => `${a.jurisdictionCode}|${a.activityCode}`));
    const labelByKey = new Map(markedActivities.map(a => [
      `${a.jurisdictionCode}|${a.activityCode}`,
      a.activityLabel ?? a.activityCode,
    ]));

    const monthlyBases: TishMonthlyActivityBase[] = [];
    const monthsNotClosed: number[] = [];
    for (const period of periods) {
      const settlement = period.grossIncomeSettlements[0];
      if (!settlement) continue;
      if (settlement.status !== 'CLOSED') monthsNotClosed.push(period.month);
      for (const line of settlement.jurisdictionLines) {
        const key = `${line.jurisdictionCode}|${line.activityCode ?? ''}`;
        if (!markedKeys.has(key)) continue;
        monthlyBases.push({
          month: period.month,
          activityCode: line.activityCode ?? '',
          activityLabel: labelByKey.get(key) ?? null,
          jurisdictionCode: line.jurisdictionCode,
          taxableBase: new Decimal(line.assignedBase.toString()),
        });
      }
    }

    const liquidation = calculateTishYear({
      year,
      monthlyBases,
      taxRate,
      category,
      parameters,
      dueDates,
    });

    const notices: string[] = [];
    if (profile && profile.vatCondition !== 'RESPONSABLE_INSCRIPTO') {
      notices.push(
        `Este contribuyente está como ${profile.vatCondition.replaceAll('_', ' ')} en el perfil fiscal. `
        + 'El módulo liquida solo el Régimen General (responsable inscripto): el régimen simplificado de '
        + 'monotributistas se abona por cuota fija según categoría y no se calcula acá.',
      );
    }
    if (markedActivities.length === 0) {
      notices.push(
        'Ninguna actividad tiene el tilde "computa TISH" en la configuración de IIBB. '
        + 'Marcá la actividad de comercio para que su base imponible alimente la tasa.',
      );
    }
    if (monthsNotClosed.length > 0) {
      notices.push(
        `Bases tomadas de liquidaciones de IIBB que todavía no están cerradas (mes/es ${monthsNotClosed.join(', ')}). `
        + 'Los importes pueden cambiar al cotejar y cerrar esos meses.',
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        client,
        year,
        hasSetting: Boolean(setting),
        vatCondition: profile?.vatCondition ?? null,
        grossIncomeRegime: profile?.grossIncomeRegime ?? null,
        setting: {
          category,
          taxRate: taxRate.toString(),
          minimumQuota: parameters.minimumQuota.toFixed(2),
          categoryAQuota: parameters.categoryAQuota.toFixed(2),
          healthRate: parameters.healthRate.toString(),
          firefightersRate: parameters.firefightersRate.toString(),
          wasteRateCategoryL: parameters.wasteRateByCategory.L.toString(),
          wasteRateCategoryM: parameters.wasteRateByCategory.M.toString(),
          wasteRateCategoryN: parameters.wasteRateByCategory.N.toString(),
          dueDates,
          notes: setting?.notes ?? null,
        },
        activities: (profile?.jurisdictions ?? []).map(j => ({
          jurisdictionCode: j.jurisdictionCode,
          activityCode: j.activityCode,
          activityLabel: j.activityLabel,
          computesTish: j.computesTish,
          isActive: j.isActive,
        })),
        bimesters: liquidation.bimesters.map(bimester => ({
          bimester: bimester.bimester,
          months: bimester.months,
          dueDate: bimester.dueDate,
          taxRate: bimester.taxRate.toString(),
          lines: bimester.lines.map(line => ({
            jurisdictionCode: line.jurisdictionCode,
            activityCode: line.activityCode,
            activityLabel: line.activityLabel,
            taxableBase: line.taxableBase.toFixed(2),
            tax: line.tax.toFixed(2),
          })),
          taxBeforeMinimum: bimester.taxBeforeMinimum.toFixed(2),
          subtotal: bimester.subtotal.toFixed(2),
          minimumApplied: bimester.minimumApplied,
          healthContribution: bimester.healthContribution.toFixed(2),
          firefightersContribution: bimester.firefightersContribution.toFixed(2),
          wasteContribution: bimester.wasteContribution.toFixed(2),
          total: bimester.total.toFixed(2),
          warnings: bimester.warnings,
        })),
        totalYear: liquidation.totalYear.toFixed(2),
        notices,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo cargar la TISH: ${messageOf(error)}` }, { status: 500 });
  }
}

/** Guarda la configuración de TISH del año (alícuota, categoría y parámetros de la ordenanza). */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId } = await context.params;

  try {
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos de TISH inválidos.' }, { status: 400 });
    }
    const data = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, cuit: true, name: true } });
    if (!client) return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });

    const values = {
      category: data.category,
      taxRate: data.taxRate,
      minimumQuota: data.minimumQuota,
      categoryAQuota: data.categoryAQuota,
      healthRate: data.healthRate,
      firefightersRate: data.firefightersRate,
      wasteRateCategoryL: data.wasteRateCategoryL,
      wasteRateCategoryM: data.wasteRateCategoryM,
      wasteRateCategoryN: data.wasteRateCategoryN,
      dueDates: data.dueDates && data.dueDates.length > 0 ? serializeTishDueDates(data.dueDates) : null,
      notes: data.notes ?? null,
    };

    const saved = await prisma.tishSetting.upsert({
      where: { clientId_year: { clientId, year: data.year } },
      create: { clientId, year: data.year, ...values },
      update: values,
      select: { id: true },
    });

    await logAuditEvent({
      action: 'UPDATE',
      entityType: 'TishSetting',
      entityId: saved.id,
      clientCuit: client.cuit,
      clientName: client.name,
      fiscalYear: data.year,
      details: `TISH ${data.year}: categoría ${data.category}, alícuota ${(data.taxRate * 100).toFixed(4)}%, `
        + `mínimo $${data.minimumQuota.toFixed(2)}, cuota A $${data.categoryAQuota.toFixed(2)}.`,
    });

    return NextResponse.json({ success: true, data: { id: saved.id, year: data.year } });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo guardar la TISH: ${messageOf(error)}` }, { status: 500 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
