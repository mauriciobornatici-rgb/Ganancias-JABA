export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

type RouteContext = { params: Promise<{ id: string }> };

/** Alícuota como fracción (0.05 = 5%). Se valida un rango razonable para evitar cargar 5 en vez de 0,05. */
const rate = z.union([z.string(), z.number()]).transform(v => Number(String(v).replace(',', '.')))
  .refine(n => !Number.isNaN(n) && n >= 0 && n <= 1, 'Alícuota inválida (usar fracción, ej. 0.05 = 5%).');
const coef = z.union([z.string(), z.number()]).transform(v => Number(String(v).replace(',', '.')))
  .refine(n => !Number.isNaN(n) && n >= 0 && n <= 1, 'Coeficiente inválido (0 a 1).');

const putSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  jurisdictions: z.array(z.object({
    jurisdictionCode: z.string().min(1).max(20),
    taxRate: rate.nullable().optional(),
    registrationNumber: z.string().max(50).nullable().optional(),
    isActive: z.boolean().optional(),
  })).max(50),
  coefficients: z.array(z.object({
    jurisdictionCode: z.string().min(1).max(20),
    unifiedCoefficient: coef,
  })).max(50).optional(),
});

async function latestProfile(clientId: string) {
  return prisma.clientTaxProfileVersion.findFirst({
    where: { clientId },
    orderBy: { validFrom: 'desc' },
    select: {
      id: true, vatCondition: true, grossIncomeRegime: true, conventionRegime: true,
      jurisdictions: { select: { jurisdictionCode: true, registrationNumber: true, taxRate: true, isActive: true }, orderBy: { jurisdictionCode: 'asc' } },
    },
  });
}

/** Devuelve la configuración de IIBB del cliente (régimen, jurisdicciones con alícuota, coeficientes CM del año). */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  const year = Number(request.nextUrl.searchParams.get('year')) || new Date().getFullYear();
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, cuit: true } });
    if (!client) return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });

    const profile = await latestProfile(clientId);
    const coefVersion = await prisma.conventionCoefficientVersion.findFirst({
      where: { clientId, year },
      select: { coefficientLines: { select: { jurisdictionCode: true, unifiedCoefficient: true } } },
    });

    return NextResponse.json({
      success: true,
      data: {
        client,
        year,
        vatCondition: profile?.vatCondition ?? 'RESPONSABLE_INSCRIPTO',
        regime: profile?.grossIncomeRegime ?? 'NONE',
        conventionRegime: profile?.conventionRegime ?? 'NONE',
        hasProfile: Boolean(profile),
        jurisdictions: (profile?.jurisdictions ?? []).map(j => ({
          jurisdictionCode: j.jurisdictionCode,
          registrationNumber: j.registrationNumber,
          taxRate: j.taxRate != null ? j.taxRate.toString() : null,
          isActive: j.isActive,
        })),
        coefficients: (coefVersion?.coefficientLines ?? []).map(l => ({
          jurisdictionCode: l.jurisdictionCode,
          unifiedCoefficient: l.unifiedCoefficient.toString(),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo cargar la configuración de IIBB: ${messageOf(error)}` }, { status: 500 });
  }
}

/** Guarda alícuotas por jurisdicción y, para Convenio Multilateral, los coeficientes unificados del año. */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  try {
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
    }
    const { year, jurisdictions, coefficients } = parsed.data;

    const profile = await prisma.clientTaxProfileVersion.findFirst({ where: { clientId }, orderBy: { validFrom: 'desc' }, select: { id: true } });
    if (!profile) {
      return NextResponse.json({ success: false, error: 'El cliente no tiene un perfil fiscal cargado. Creá el perfil antes de configurar IIBB.' }, { status: 409 });
    }

    // Coeficientes CM: deben sumar 1 si se cargan (tolerancia 0.0001).
    if (coefficients && coefficients.length > 0) {
      const sum = coefficients.reduce((s, c) => s + c.unifiedCoefficient, 0);
      if (Math.abs(sum - 1) > 0.0001) {
        return NextResponse.json(
          { success: false, error: `Los coeficientes de Convenio Multilateral deben sumar 1,000000. Suman ${sum.toFixed(6)}.` },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async tx => {
      for (const j of jurisdictions) {
        await tx.clientTaxJurisdiction.upsert({
          where: { taxProfileId_jurisdictionCode: { taxProfileId: profile.id, jurisdictionCode: j.jurisdictionCode } },
          update: {
            taxRate: j.taxRate ?? null,
            ...(j.registrationNumber !== undefined ? { registrationNumber: j.registrationNumber } : {}),
            ...(j.isActive !== undefined ? { isActive: j.isActive } : {}),
          },
          create: {
            taxProfileId: profile.id,
            jurisdictionCode: j.jurisdictionCode,
            taxRate: j.taxRate ?? null,
            registrationNumber: j.registrationNumber ?? null,
            isActive: j.isActive ?? true,
          },
        });
      }

      if (coefficients && coefficients.length > 0) {
        const version = await tx.conventionCoefficientVersion.upsert({
          where: { clientId_year: { clientId, year } },
          update: {},
          create: { clientId, year },
          select: { id: true },
        });
        for (const c of coefficients) {
          await tx.conventionCoefficientLine.upsert({
            where: { coefficientVersionId_jurisdictionCode: { coefficientVersionId: version.id, jurisdictionCode: c.jurisdictionCode } },
            // income/expense se igualan al unificado como referencia; el cálculo usa el unificado (CM05).
            update: { unifiedCoefficient: c.unifiedCoefficient, incomeCoefficient: c.unifiedCoefficient, expenseCoefficient: c.unifiedCoefficient },
            create: { coefficientVersionId: version.id, jurisdictionCode: c.jurisdictionCode, unifiedCoefficient: c.unifiedCoefficient, incomeCoefficient: c.unifiedCoefficient, expenseCoefficient: c.unifiedCoefficient },
          });
        }
      }
    });

    void logAuditEvent({
      action: 'UPDATE',
      entityType: 'ClientTaxProfileVersion',
      entityId: profile.id,
      fiscalYear: year,
      details: `Configuración IIBB: ${jurisdictions.length} jurisdicción(es)${coefficients?.length ? `, ${coefficients.length} coeficiente(s) CM ${year}` : ''}.`,
    });

    return NextResponse.json({ success: true, data: { updated: jurisdictions.length, coefficients: coefficients?.length ?? 0 } });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo guardar la configuración de IIBB: ${messageOf(error)}` }, { status: 500 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
