export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import {
  accumulateTishBimesterBases,
  calculateTishBimester,
  defaultTishParametersForYear,
  emptyTishParameters,
  normalizeTishCategory,
  monthsOfBimester,
  parseTishDueDates,
  serializeTishDueDates,
  TISH_BIMESTERS,
  TISH_DUE_DATES_2026,
  type TishMonthlyActivityBase,
  type TishParameters,
} from '@/domain/ganancias/fiscalLedger/tish';
import {
  evaluateTishCalculationContext,
  tishBimesterSourceState,
} from '@/domain/ganancias/fiscalLedger/tishContext';
import { isPrismaUniqueConstraintError } from '@/domain/ganancias/persistence/taxReturnPersistencePolicy';
import {
  buildTishSourceFingerprint,
  nextTishSettlementVersion,
} from '@/domain/ganancias/fiscalLedger/tishSettlementVersioning';

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
const positiveTaxRate = fraction.refine(n => n > 0, 'La alícuota TISH debe ser mayor a cero.');
const positiveMoney = money.refine(n => n > 0, 'El importe debe ser mayor a cero.');

const putSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  category: z.enum(['L', 'M', 'N']),
  taxRate: positiveTaxRate,
  minimumQuota: positiveMoney,
  categoryAQuota: positiveMoney,
  healthRate: fraction,
  firefightersRate: fraction,
  wasteRateCategoryL: fraction,
  wasteRateCategoryM: fraction,
  wasteRateCategoryN: fraction,
  dueDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(6).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const closeSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  bimester: z.number().int().min(1).max(6),
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

function parametersOf(setting: TishSettingRow | null, year: number): TishParameters {
  if (!setting) return defaultTishParametersForYear(year) ?? emptyTishParameters();
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

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));
    const profile = await prisma.clientTaxProfileVersion.findFirst({
      where: {
        clientId,
        validFrom: { lt: nextYearStart },
        OR: [{ validTo: null }, { validTo: { gte: yearStart } }],
      },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        validFrom: true,
        validTo: true,
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

    const parameters = parametersOf(setting, year);
    const category = normalizeTishCategory(setting?.category);
    const taxRate = setting ? new Decimal(setting.taxRate.toString()) : new Decimal(0);
    const dueDates = setting?.dueDates
      ? parseTishDueDates(setting.dueDates)
      : year === 2026 ? [...TISH_DUE_DATES_2026] : [];
    const hasCompleteSetting = Boolean(
      setting
      && taxRate.gt(0)
      && parameters.minimumQuota.gt(0)
      && parameters.categoryAQuota.gt(0),
    );

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
    const monthsWithSettlement: number[] = [];
    const closedMonths: number[] = [];
    for (const period of periods) {
      const settlement = period.grossIncomeSettlements[0];
      if (!settlement) continue;
      monthsWithSettlement.push(period.month);
      if (settlement.status === 'CLOSED') {
        closedMonths.push(period.month);
      } else {
        monthsNotClosed.push(period.month);
      }
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

    const calculationContext = evaluateTishCalculationContext({
      hasProfile: Boolean(profile),
      vatCondition: profile?.vatCondition ?? null,
      hasCompleteSetting,
      markedActivityCount: markedActivities.length,
      monthsWithSettlement,
      closedMonths,
    });

    const bimesters = calculationContext.canPreview
      ? TISH_BIMESTERS.flatMap(bimester => {
          const sourceState = tishBimesterSourceState(
            bimester,
            monthsWithSettlement,
            closedMonths,
          );
          // Sin fuente mensual no se inventa el mínimo de otro período.
          if (sourceState === 'NO_SOURCE') return [];
          return [{
            sourceState,
            result: calculateTishBimester({
              year,
              bimester,
              activityBases: accumulateTishBimesterBases(monthlyBases, bimester),
              taxRate,
              category,
              parameters,
              dueDates,
            }),
          }];
        })
      : [];
    const totalYear = bimesters.reduce(
      (sum, item) => sum.add(item.result.total),
      new Decimal(0),
    );

    const notices: string[] = [];
    if (!profile) {
      notices.push(
        `No existe un perfil fiscal vigente dentro de ${year}. Configure la vigencia antes de liquidar TISH.`,
      );
    } else if (profile.vatCondition !== 'RESPONSABLE_INSCRIPTO') {
      notices.push(
        `Este contribuyente está como ${profile.vatCondition.replaceAll('_', ' ')} en el perfil fiscal. `
        + 'El módulo liquida solo el Régimen General (responsable inscripto): el régimen simplificado de '
        + 'monotributistas se abona por cuota fija según categoría y no se calcula acá.',
      );
    }
    if (!setting) {
      notices.push(
        year === 2026
          ? 'Los valores 2026 se muestran como referencia, pero debe guardar la configuración del contribuyente antes de calcular.'
          : `No hay parámetros TISH guardados para ${year}. No se trasladaron automáticamente los importes de la ordenanza 2026.`,
      );
    } else if (!hasCompleteSetting) {
      notices.push(
        `La configuración TISH ${year} está incompleta: cargue una alícuota y cuotas mayores a cero antes de calcular.`,
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
        `Preliquidación: hay bases tomadas de IIBB todavía no cerrado (mes/es ${monthsNotClosed.join(', ')}). `
        + 'Esos bimestres no son definitivos y pueden cambiar.',
      );
    }
    const currentDate = new Date();
    const expectedMonth = year < currentDate.getFullYear()
      ? 12
      : year === currentDate.getFullYear() ? currentDate.getMonth() + 1 : 0;
    const monthsWithoutSettlement = Array.from({ length: expectedMonth }, (_, index) => index + 1)
      .filter(month => !monthsWithSettlement.includes(month));
    if (monthsWithoutSettlement.length > 0) {
      notices.push(
        `Faltan liquidaciones de IIBB para el/los mes/es ${monthsWithoutSettlement.join(', ')}. `
        + 'No se calculó ningún bimestre sin fuente mensual.',
      );
    }
    const savedSettlements = await prisma.tishSettlement.findMany({
      where: { clientId, year },
      orderBy: [{ bimester: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        bimester: true,
        version: true,
        status: true,
        total: true,
        sourceFingerprint: true,
        closedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        client,
        year,
        hasSetting: Boolean(setting),
        hasCompleteSetting,
        calculationState: calculationContext.state,
        canPreview: calculationContext.canPreview,
        canFinalize: calculationContext.canFinalize,
        parameterSource: setting ? 'SAVED' : year === 2026 ? 'REFERENCE_2026' : 'MISSING',
        vatCondition: profile?.vatCondition ?? null,
        grossIncomeRegime: profile?.grossIncomeRegime ?? null,
        profile: profile ? {
          id: profile.id,
          validFrom: profile.validFrom.toISOString().slice(0, 10),
          validTo: profile.validTo?.toISOString().slice(0, 10) ?? null,
        } : null,
        monthsNotClosed,
        monthsWithoutSettlement,
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
        bimesters: bimesters.map(({ result: bimester, sourceState }) => ({
          bimester: bimester.bimester,
          sourceState,
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
        totalYear: totalYear.toFixed(2),
        savedSettlements: savedSettlements.map(saved => ({
          id: saved.id,
          bimester: saved.bimester,
          version: saved.version,
          status: saved.status,
          total: saved.total.toString(),
          sourceFingerprint: saved.sourceFingerprint,
          closedAt: saved.closedAt.toISOString(),
        })),
        notices,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo cargar la TISH: ${messageOf(error)}` }, { status: 500 });
  }
}

/**
 * Cierra un bimestre TISH con fuentes IIBB definitivas. Si la misma huella ya fue guardada,
 * devuelve esa versión; si las fuentes cambiaron, crea una nueva sin sobrescribir el historial.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId } = await context.params;

  try {
    const parsed = closeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'Bimestre TISH inválido.' },
        { status: 400 },
      );
    }
    const { year, bimester } = parsed.data;
    const months = monthsOfBimester(bimester as 1 | 2 | 3 | 4 | 5 | 6);
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, cuit: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });
    }

    const profile = await prisma.clientTaxProfileVersion.findFirst({
      where: {
        clientId,
        validFrom: { lt: nextYearStart },
        OR: [{ validTo: null }, { validTo: { gte: yearStart } }],
      },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        validFrom: true,
        validTo: true,
        vatCondition: true,
        jurisdictions: {
          where: { isActive: true, computesTish: true },
          select: {
            jurisdictionCode: true,
            activityCode: true,
            activityLabel: true,
          },
        },
      },
    });
    if (!profile) {
      return NextResponse.json(
        { success: false, error: `No existe un perfil fiscal vigente dentro de ${year}.` },
        { status: 409 },
      );
    }
    if (profile.vatCondition !== 'RESPONSABLE_INSCRIPTO') {
      return NextResponse.json(
        { success: false, error: 'TISH Régimen General solo se cierra para responsables inscriptos.' },
        { status: 409 },
      );
    }
    if (profile.jurisdictions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay una actividad activa marcada como "computa TISH".' },
        { status: 409 },
      );
    }

    const setting = await prisma.tishSetting.findUnique({
      where: { clientId_year: { clientId, year } },
    });
    if (!setting) {
      return NextResponse.json(
        { success: false, error: `Debe guardar la configuración TISH ${year} antes de cerrar.` },
        { status: 409 },
      );
    }
    const parameters = parametersOf(setting, year);
    const taxRate = new Decimal(setting.taxRate.toString());
    if (taxRate.lte(0) || parameters.minimumQuota.lte(0) || parameters.categoryAQuota.lte(0)) {
      return NextResponse.json(
        { success: false, error: `La configuración TISH ${year} está incompleta.` },
        { status: 409 },
      );
    }

    const periods = await prisma.fiscalPeriod.findMany({
      where: { clientId, year, month: { in: months } },
      orderBy: { month: 'asc' },
      select: {
        month: true,
        grossIncomeSettlements: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            status: true,
            updatedAt: true,
            jurisdictionLines: {
              select: {
                jurisdictionCode: true,
                activityCode: true,
                assignedBase: true,
              },
            },
          },
        },
      },
    });
    const sourceByMonth = new Map(periods.map(period => [period.month, period.grossIncomeSettlements[0]]));
    const unavailableMonths = months.filter(month => sourceByMonth.get(month)?.status !== 'CLOSED');
    if (unavailableMonths.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede cerrar el ${bimester}º bimestre: IIBB no está cerrado en el/los mes/es ${unavailableMonths.join(', ')}.`,
        },
        { status: 409 },
      );
    }

    const markedKeys = new Set(profile.jurisdictions.map(
      activity => `${activity.jurisdictionCode}|${activity.activityCode}`,
    ));
    const labelByKey = new Map(profile.jurisdictions.map(activity => [
      `${activity.jurisdictionCode}|${activity.activityCode}`,
      activity.activityLabel ?? activity.activityCode,
    ]));
    const monthlyBases: TishMonthlyActivityBase[] = [];
    for (const period of periods) {
      const settlement = period.grossIncomeSettlements[0];
      if (!settlement) continue;
      for (const line of settlement.jurisdictionLines) {
        const key = `${line.jurisdictionCode}|${line.activityCode ?? ''}`;
        if (!markedKeys.has(key)) continue;
        monthlyBases.push({
          month: period.month,
          jurisdictionCode: line.jurisdictionCode,
          activityCode: line.activityCode ?? '',
          activityLabel: labelByKey.get(key) ?? null,
          taxableBase: new Decimal(line.assignedBase.toString()),
        });
      }
    }

    const dueDates = setting.dueDates ? parseTishDueDates(setting.dueDates) : [];
    const result = calculateTishBimester({
      year,
      bimester: bimester as 1 | 2 | 3 | 4 | 5 | 6,
      activityBases: accumulateTishBimesterBases(
        monthlyBases,
        bimester as 1 | 2 | 3 | 4 | 5 | 6,
      ),
      taxRate,
      category: normalizeTishCategory(setting.category),
      parameters,
      dueDates,
    });

    const sourceSnapshot = {
      year,
      bimester,
      months,
      profile: {
        id: profile.id,
        validFrom: profile.validFrom.toISOString(),
        validTo: profile.validTo?.toISOString() ?? null,
        markedActivities: profile.jurisdictions
          .map(activity => ({
            jurisdictionCode: activity.jurisdictionCode,
            activityCode: activity.activityCode,
            activityLabel: activity.activityLabel ?? null,
          }))
          .sort((left, right) => (
            `${left.jurisdictionCode}|${left.activityCode}`
              .localeCompare(`${right.jurisdictionCode}|${right.activityCode}`)
          )),
      },
      setting: {
        id: setting.id,
        updatedAt: setting.updatedAt.toISOString(),
        category: setting.category,
        taxRate: setting.taxRate.toString(),
        minimumQuota: setting.minimumQuota.toString(),
        categoryAQuota: setting.categoryAQuota.toString(),
        healthRate: setting.healthRate.toString(),
        firefightersRate: setting.firefightersRate.toString(),
        wasteRateCategoryL: setting.wasteRateCategoryL.toString(),
        wasteRateCategoryM: setting.wasteRateCategoryM.toString(),
        wasteRateCategoryN: setting.wasteRateCategoryN.toString(),
        dueDates,
      },
      iibbSettlements: periods.map(period => {
        const source = period.grossIncomeSettlements[0]!;
        return {
          month: period.month,
          id: source.id,
          version: source.version,
          status: source.status,
          updatedAt: source.updatedAt.toISOString(),
          lines: source.jurisdictionLines
            .map(line => ({
              jurisdictionCode: line.jurisdictionCode,
              activityCode: line.activityCode ?? '',
              assignedBase: line.assignedBase.toString(),
            }))
            .sort((left, right) => (
              `${left.jurisdictionCode}|${left.activityCode}`
                .localeCompare(`${right.jurisdictionCode}|${right.activityCode}`)
            )),
        };
      }),
    };
    const sourceFingerprint = buildTishSourceFingerprint(sourceSnapshot);
    const calculationSnapshot = {
      year: result.year,
      bimester: result.bimester,
      months: result.months,
      dueDate: result.dueDate,
      category: result.category,
      taxRate: result.taxRate.toString(),
      lines: result.lines.map(line => ({
        jurisdictionCode: line.jurisdictionCode ?? null,
        activityCode: line.activityCode,
        activityLabel: line.activityLabel ?? null,
        taxableBase: line.taxableBase.toFixed(2),
        tax: line.tax.toFixed(2),
      })),
      taxBeforeMinimum: result.taxBeforeMinimum.toFixed(2),
      subtotal: result.subtotal.toFixed(2),
      minimumApplied: result.minimumApplied,
      healthContribution: result.healthContribution.toFixed(2),
      firefightersContribution: result.firefightersContribution.toFixed(2),
      wasteContribution: result.wasteContribution.toFixed(2),
      total: result.total.toFixed(2),
      warnings: result.warnings,
    };

    const saved = await prisma.$transaction(async tx => {
      const existing = await tx.tishSettlement.findUnique({
        where: {
          clientId_year_bimester_sourceFingerprint: {
            clientId,
            year,
            bimester,
            sourceFingerprint,
          },
        },
        select: { id: true, version: true, total: true, closedAt: true },
      });
      if (existing) return { ...existing, deduplicated: true };

      const latest = await tx.tishSettlement.findFirst({
        where: { clientId, year, bimester },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const created = await tx.tishSettlement.create({
        data: {
          clientId,
          tishSettingId: setting.id,
          taxProfileId: profile.id,
          year,
          bimester,
          version: nextTishSettlementVersion(latest?.version),
          sourceFingerprint,
          sourceSnapshot,
          calculationSnapshot,
          total: result.total.toFixed(2),
        },
        select: { id: true, version: true, total: true, closedAt: true },
      });
      await tx.auditLog.create({
        data: {
          action: 'CLOSE',
          entityType: 'TishSettlement',
          entityId: created.id,
          clientCuit: client.cuit,
          clientName: client.name,
          fiscalYear: year,
          details: `TISH ${year}, ${bimester}º bimestre, versión ${created.version}, total $${result.total.toFixed(2)}. `
            + `Fuentes IIBB cerradas: ${sourceSnapshot.iibbSettlements.map(source => `${source.month}/v${source.version}`).join(', ')}.`,
        },
      });
      return { ...created, deduplicated: false };
    });

    return NextResponse.json({
      success: true,
      data: {
        id: saved.id,
        year,
        bimester,
        version: saved.version,
        total: saved.total.toString(),
        closedAt: saved.closedAt.toISOString(),
        sourceFingerprint,
        deduplicated: saved.deduplicated,
      },
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return NextResponse.json(
        { success: false, error: 'Otra sesión guardó una versión TISH al mismo tiempo. Actualice y vuelva a intentar.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: `No se pudo cerrar la liquidación TISH: ${messageOf(error)}` },
      { status: 500 },
    );
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
