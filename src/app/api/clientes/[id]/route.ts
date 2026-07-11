export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/generated/client/client';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import {
  canReactivateClient,
  clientReactivationRequestSchema,
} from '@/domain/ganancias/clients/clientLifecycle';

// GET /api/clientes/[id] — Obtener un contribuyente por ID
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        taxReturns: {
          select: {
            id: true,
            status: true,
            version: true,
            createdAt: true,
            fiscalYear: { select: { year: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Contribuyente no encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: client });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al obtener contribuyente: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

// PUT /api/clientes/[id] — Actualizar datos de un contribuyente
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireRouteAuth(req);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, fiscalCondition, mainActivity, responsibleName, notes } = body;

    // Verificar que el contribuyente existe
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Contribuyente no encontrado.' },
        { status: 404 }
      );
    }

    // Construir objeto de actualización solo con campos proporcionados
    const updateData: Prisma.ClientUpdateInput = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (fiscalCondition !== undefined) updateData.fiscalCondition = fiscalCondition;
    if (mainActivity !== undefined) updateData.mainActivity = mainActivity;
    if (responsibleName !== undefined) updateData.responsibleName = responsibleName;
    if (notes !== undefined) updateData.notes = notes;

    // No se permite cambiar el CUIT (es inmutable como identificador fiscal)
    if (body.cuit && body.cuit !== existing.cuit) {
      return NextResponse.json(
        { success: false, error: 'El CUIT no puede ser modificado: es el identificador fiscal del contribuyente y su historial depende de él. Si se cargó un CUIT incorrecto, contactá al administrador para una corrección controlada.' },
        { status: 400 }
      );
    }

    const updated = await prisma.client.update({
      where: { id },
      data: updateData,
    });

    // Registrar en auditoría
    const changedFields = Object.keys(updateData).join(', ');
    await logAuditEvent({
      action: 'UPDATE',
      entityType: 'Client',
      entityId: id,
      clientCuit: existing.cuit,
      clientName: updated.name,
      details: `Modificación de contribuyente ${existing.name} (${existing.cuit}). Campos actualizados: ${changedFields}`,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al actualizar contribuyente: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

// PATCH /api/clientes/[id] — Reactivar un contribuyente dado de baja
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireRouteAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => null);
    const parsed = clientReactivationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Solicitud de reactivación inválida.' },
        { status: 400 }
      );
    }

    const { id } = await params;
    const existing = await prisma.client.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Contribuyente no encontrado.' },
        { status: 404 }
      );
    }

    if (!canReactivateClient(existing.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `El contribuyente ${existing.name} (${existing.cuit}) no se encuentra dado de baja.`,
        },
        { status: 409 }
      );
    }

    const [updated] = await prisma.$transaction([
      prisma.client.update({ where: { id }, data: { status: 'Activo' } }),
      prisma.auditLog.create({ data: {
        action: 'UPDATE',
        entityType: 'Client',
        entityId: id,
        clientCuit: existing.cuit,
        clientName: existing.name,
        details: `Reactivación de contribuyente: ${existing.name} (${existing.cuit}). Se conserva y recupera el historial fiscal completo.`,
      } }),
    ]);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al reactivar al contribuyente: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

// DELETE /api/clientes/[id] — Baja lógica del contribuyente
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireRouteAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;

    const existing = await prisma.client.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Contribuyente no encontrado.' },
        { status: 404 }
      );
    }

    if (existing.status === 'Inactivo') {
      return NextResponse.json(
        {
          success: false,
          error: `El contribuyente ${existing.name} (${existing.cuit}) ya se encuentra inactivo.`,
        },
        { status: 409 }
      );
    }

    // Conserva DDJJ, períodos, liquidaciones y documentos para auditoría.
    await prisma.$transaction([
      prisma.client.update({ where: { id }, data: { status: 'Inactivo' } }),
      prisma.auditLog.create({ data: {
        action: 'UPDATE',
        entityType: 'Client',
        entityId: id,
        clientCuit: existing.cuit,
        clientName: existing.name,
        details: `Baja lógica de contribuyente: ${existing.name} (${existing.cuit}). Se conserva el historial fiscal completo.`,
      } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { id, message: `Contribuyente ${existing.name} marcado como inactivo. Su historial fue conservado.` },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al dar de baja al contribuyente: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
