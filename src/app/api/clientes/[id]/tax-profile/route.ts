export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

type RouteContext = { params: Promise<{ id: string }> };

const profileSchema = z.object({
  vatCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'EXENTO', 'MONOTRIBUTO', 'OTRO']),
  grossIncomeRegime: z.enum(['NONE', 'ARBA_LOCAL', 'ARBA_SIMPLIFICADO', 'CM_REGIMEN_GENERAL', 'CM_REGIMEN_ESPECIAL']),
  conventionRegime: z.enum(['NONE', 'GENERAL', 'ESPECIAL']).optional().default('NONE'),
  // validFrom opcional; por defecto cubre cualquier período soportado.
  validFrom: z.string().optional(),
});

/** Devuelve el perfil fiscal vigente (última versión) del contribuyente. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  try {
    const profile = await prisma.clientTaxProfileVersion.findFirst({
      where: { clientId },
      orderBy: { validFrom: 'desc' },
      select: { id: true, vatCondition: true, grossIncomeRegime: true, conventionRegime: true, validFrom: true, validTo: true },
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
 * Crea o actualiza el perfil fiscal del contribuyente (condición de IVA, régimen de IIBB, Convenio).
 * Si ya existe una versión, se actualiza la última; si no, se crea una vigente desde 2020 (cubre los
 * períodos soportados). El régimen define si se liquida IIBB y si aplica Convenio Multilateral.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  try {
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos de perfil inválidos.' }, { status: 400 });
    }
    const { vatCondition, grossIncomeRegime, conventionRegime } = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, cuit: true, name: true } });
    if (!client) return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });

    const existing = await prisma.clientTaxProfileVersion.findFirst({ where: { clientId }, orderBy: { validFrom: 'desc' }, select: { id: true } });

    let profileId: string;
    if (existing) {
      await prisma.clientTaxProfileVersion.update({
        where: { id: existing.id },
        data: { vatCondition, grossIncomeRegime, conventionRegime },
      });
      profileId = existing.id;
    } else {
      const validFrom = parsed.data.validFrom ? new Date(`${parsed.data.validFrom}T00:00:00Z`) : new Date(Date.UTC(2020, 0, 1));
      const created = await prisma.clientTaxProfileVersion.create({
        data: { clientId, validFrom, vatCondition, grossIncomeRegime, conventionRegime },
        select: { id: true },
      });
      profileId = created.id;
    }

    void logAuditEvent({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'ClientTaxProfileVersion',
      entityId: profileId,
      clientCuit: client.cuit,
      clientName: client.name,
      details: `Perfil fiscal: IVA ${vatCondition}, IIBB ${grossIncomeRegime}, Convenio ${conventionRegime}.`,
    });

    return NextResponse.json({ success: true, data: { id: profileId, created: !existing } });
  } catch (error) {
    return NextResponse.json({ success: false, error: `No se pudo guardar el perfil fiscal: ${messageOf(error)}` }, { status: 500 });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
