export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/client/client';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { resolveActiveFiscalProfile } from '@/domain/ganancias/fiscalLedger/activeFiscalProfile';
import { createFiscalPeriodSchema } from '@/domain/ganancias/fiscalLedger/fiscalPeriodRequest';
import { prisma } from '@/domain/ganancias/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, cuit: true, name: true, fiscalCondition: true, mainActivity: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: 'Contribuyente inexistente.' }, { status: 404 });
    }

    const periods = await prisma.fiscalPeriod.findMany({
      where: { clientId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        taxProfile: {
          select: {
            vatCondition: true,
            grossIncomeRegime: true,
            conventionRegime: true,
          },
        },
        vatSettlements: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { status: true, amountDue: true, officialAmount: true },
        },
        grossIncomeSettlements: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { status: true, totalBalance: true, officialAmount: true },
        },
        _count: { select: { documents: true } },
      },
    });

    return NextResponse.json({ success: true, data: { client, periods } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudieron obtener los periodos mensuales: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  const parsed = createFiscalPeriodSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Ano y mes invalidos para el periodo fiscal.' }, { status: 400 });
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, cuit: true, name: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: 'Contribuyente inexistente.' }, { status: 404 });
    }

    const profiles = await prisma.clientTaxProfileVersion.findMany({
      where: { clientId },
      select: { id: true, validFrom: true, validTo: true },
    });
    const profile = resolveActiveFiscalProfile(profiles, parsed.data.year, parsed.data.month);

    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'No existe un perfil fiscal vigente para el cierre de este periodo. Cargue o revise el perfil del contribuyente antes de continuar.',
      }, { status: 422 });
    }

    const period = await prisma.fiscalPeriod.create({
      data: {
        clientId,
        taxProfileId: profile.id,
        year: parsed.data.year,
        month: parsed.data.month,
      },
      select: { id: true, year: true, month: true, taxProfileId: true, createdAt: true },
    });

    await logAuditEvent({
      action: 'CREATE',
      entityType: 'FiscalPeriod',
      entityId: period.id,
      clientCuit: client.cuit,
      clientName: client.name,
      fiscalYear: period.year,
      details: `Alta de libro fiscal mensual ${String(period.month).padStart(2, '0')}/${period.year}.`,
    });

    return NextResponse.json({ success: true, data: period }, { status: 201 });
  } catch (error) {
    if (isUniquePeriodError(error)) {
      return NextResponse.json({
        success: false,
        error: 'El periodo mensual ya existe para este contribuyente.',
      }, { status: 409 });
    }

    return NextResponse.json(
      { success: false, error: `No se pudo crear el periodo mensual: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

function isUniquePeriodError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
