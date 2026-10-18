export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import { normalizeIdcbComputablePercent } from '@/domain/ganancias/fiscalLedger/bankTaxCredit';

type RouteContext = { params: Promise<{ id: string }> };

const profileSchema = z.object({
  vatCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'EXENTO', 'MONOTRIBUTO', 'OTRO']),
  grossIncomeRegime: z.enum(['NONE', 'ARBA_LOCAL', 'ARBA_SIMPLIFICADO', 'CM_REGIMEN_GENERAL', 'CM_REGIMEN_ESPECIAL']),
  conventionRegime: z.enum(['NONE', 'GENERAL', 'ESPECIAL']).optional().default('NONE'),
  smallTaxpayerBenefitEnabled: z.boolean().optional().default(false),
  smallTaxpayerBenefitStartYear: z.number().int().min(2021).max(2100).nullable().optional(),
  // Impuesto al cheque computable como pago a cuenta de Ganancias: 33% general, 100% micro y
  // pequeña empresa. Solo esos dos valores (decisión del usuario 2026-07-24).
  idcbComputablePercent: z.union([z.literal(33), z.literal(100)]).optional().default(33),
  // validFrom opcional; por defecto cubre cualquier período soportado.
  validFrom: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.smallTaxpayerBenefitEnabled && value.smallTaxpayerBenefitStartYear == null) {
    ctx.addIssue({ code: 'custom', path: ['smallTaxpayerBenefitStartYear'], message: 'Indicá el primer año del beneficio de IVA.' });
  }
});

/** Devuelve el perfil fiscal vigente (última versión) del contribuyente. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  try {
    const profile = await prisma.clientTaxProfileVersion.findFirst({
      where: { clientId },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true, vatCondition: true, grossIncomeRegime: true, conventionRegime: true,
        smallTaxpayerBenefitEnabled: true, smallTaxpayerBenefitStartYear: true,
        idcbComputablePercent: true,
        validFrom: true, validTo: true,
      },
    });
    return NextResponse.json({
      success: true,
      data: {
        profile: profile
          ? {
              id: profile.id,
              vatCondition: profile.vatCondition,
              grossIncomeRegime: profile.grossIncomeRegime,
              conventionRegime: profile.conventionRegime,
              smallTaxpayerBenefitEnabled: profile.smallTaxpayerBenefitEnabled,
              smallTaxpayerBenefitStartYear: profile.smallTaxpayerBenefitStartYear,
              idcbComputablePercent: normalizeIdcbComputablePercent(profile.idcbComputablePercent),
              validFrom: profile.validFrom.toISOString().slice(0, 10),
              validTo: profile.validTo ? profile.validTo.toISOString().slice(0, 10) : null,
            }
          : null,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo cargar el perfil fiscal: ${messageOf(error)}` }, { status: 500 });
  }
}

/**
 * Crea una nueva versión del perfil fiscal y cierra la vigencia anterior.
 * Nunca modifica una versión histórica que pueda estar vinculada a períodos ya liquidados.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: clientId } = await context.params;
  try {
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos de perfil inválidos.' }, { status: 400 });
    }
    const {
      vatCondition, grossIncomeRegime, conventionRegime,
      smallTaxpayerBenefitEnabled, smallTaxpayerBenefitStartYear,
      idcbComputablePercent,
    } = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, cuit: true, name: true } });
    if (!client) return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });

    const existing = await prisma.clientTaxProfileVersion.findFirst({
      where: { clientId },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        validFrom: true,
        jurisdictions: {
          select: {
            jurisdictionCode: true, activityCode: true, activityLabel: true,
            registrationNumber: true, taxRate: true, computesTish: true, isActive: true,
          },
        },
      },
    });

    const validFrom = parsed.data.validFrom
      ? new Date(`${parsed.data.validFrom}T00:00:00Z`)
      : existing ? new Date() : new Date(Date.UTC(2020, 0, 1));
    if (existing && validFrom.getTime() <= existing.validFrom.getTime()) {
      return NextResponse.json(
        { success: false, error: 'La nueva vigencia debe comenzar después de la versión fiscal actual.' },
        { status: 409 },
      );
    }

    const profileId = await prisma.$transaction(async tx => {
      if (existing) {
        await tx.clientTaxProfileVersion.update({
          where: { id: existing.id },
          data: { validTo: new Date(validFrom.getTime() - 1) },
        });
      }

      const created = await tx.clientTaxProfileVersion.create({
        data: {
          clientId,
          validFrom,
          vatCondition,
          grossIncomeRegime,
          conventionRegime,
          smallTaxpayerBenefitEnabled,
          smallTaxpayerBenefitStartYear: smallTaxpayerBenefitEnabled ? smallTaxpayerBenefitStartYear : null,
          idcbComputablePercent,
          jurisdictions: existing?.jurisdictions.length
            ? { create: existing.jurisdictions.map(j => ({
                jurisdictionCode: j.jurisdictionCode,
                activityCode: j.activityCode,
                activityLabel: j.activityLabel,
                registrationNumber: j.registrationNumber,
                taxRate: j.taxRate,
                computesTish: j.computesTish,
                isActive: j.isActive,
              })) }
            : undefined,
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: {
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'ClientTaxProfileVersion',
        entityId: created.id,
        clientCuit: client.cuit,
        clientName: client.name,
        details: `Perfil fiscal: IVA ${vatCondition}, IIBB ${grossIncomeRegime}, Convenio ${conventionRegime}. Beneficio IVA: ${smallTaxpayerBenefitEnabled ? `desde ${smallTaxpayerBenefitStartYear}` : 'no aplica'}. Impuesto al cheque computable: ${idcbComputablePercent}%.`,
      } });
      return created.id;
    });

    return NextResponse.json({ success: true, data: { id: profileId, created: true, supersedes: existing?.id ?? null } });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo guardar el perfil fiscal: ${messageOf(error)}` }, { status: 500 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
