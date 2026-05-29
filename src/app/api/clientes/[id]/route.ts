export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

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
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al obtener contribuyente: ${err.message}` },
      { status: 500 }
    );
  }
}

// PUT /api/clientes/[id] — Actualizar datos de un contribuyente
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, fiscalCondition, mainActivity, responsibleName, status, notes } = body;

    // Verificar que el contribuyente existe
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Contribuyente no encontrado.' },
        { status: 404 }
      );
    }

    // Construir objeto de actualización solo con campos proporcionados
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (fiscalCondition !== undefined) updateData.fiscalCondition = fiscalCondition;
    if (mainActivity !== undefined) updateData.mainActivity = mainActivity;
    if (responsibleName !== undefined) updateData.responsibleName = responsibleName;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // No se permite cambiar el CUIT (es inmutable como identificador fiscal)
    if (body.cuit && body.cuit !== existing.cuit) {
      return NextResponse.json(
        { success: false, error: 'El CUIT no puede ser modificado. Si necesita corregirlo, elimine el contribuyente y cree uno nuevo.' },
        { status: 400 }
      );
    }

    const updated = await prisma.client.update({
      where: { id },
      data: updateData,
    });

    // Registrar en auditoría
    const changedFields = Object.keys(updateData).join(', ');
    logAuditEvent({
      action: 'UPDATE',
      entityType: 'Client',
      entityId: id,
      clientCuit: existing.cuit,
      clientName: updated.name,
      details: `Modificación de contribuyente ${existing.name} (${existing.cuit}). Campos actualizados: ${changedFields}`,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al actualizar contribuyente: ${err.message}` },
      { status: 500 }
    );
  }
}

// DELETE /api/clientes/[id] — Eliminar un contribuyente
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verificar que el contribuyente existe
    const existing = await prisma.client.findUnique({
      where: { id },
      include: {
        taxReturns: {
          where: {
            status: { in: ['Presentada', 'Cerrada'] },
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Contribuyente no encontrado.' },
        { status: 404 }
      );
    }

    // Impedir eliminación si hay declaraciones presentadas o cerradas
    if (existing.taxReturns.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede eliminar el contribuyente ${existing.name} (${existing.cuit}) porque tiene ${existing.taxReturns.length} declaración(es) en estado Presentada o Cerrada. Primero debe anular o rectificar dichas declaraciones.`,
        },
        { status: 409 }
      );
    }

    // Eliminar (cascade borrará borradores asociados por FK)
    await prisma.client.delete({ where: { id } });

    // Registrar en auditoría
    logAuditEvent({
      action: 'DELETE',
      entityType: 'Client',
      entityId: id,
      clientCuit: existing.cuit,
      clientName: existing.name,
      details: `Baja de contribuyente: ${existing.name} (${existing.cuit})`,
    });

    return NextResponse.json({
      success: true,
      data: { id, message: `Contribuyente ${existing.name} eliminado exitosamente.` },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al eliminar contribuyente: ${err.message}` },
      { status: 500 }
    );
  }
}
