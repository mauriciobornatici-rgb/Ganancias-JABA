export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';

// GET /api/auditoria — Obtener registros de auditoría con filtros opcionales
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const entityType = searchParams.get('entityType');
    const action = searchParams.get('action');
    const clientCuit = searchParams.get('clientCuit');
    const fiscalYear = searchParams.get('fiscalYear');

    // Construir filtro dinámico
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (clientCuit) where.clientCuit = clientCuit;
    if (fiscalYear) where.fiscalYear = parseInt(fiscalYear, 10);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 200),
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: logs,
      meta: { total, limit, offset },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al obtener registros de auditoría: ${err.message}` },
      { status: 500 }
    );
  }
}

// POST /api/auditoria — Registrar manualmente un evento de auditoría
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, entityType, entityId, clientCuit, clientName, fiscalYear, details } = body;

    if (!action || !entityType) {
      return NextResponse.json(
        { success: false, error: 'Se requieren los campos "action" y "entityType".' },
        { status: 400 }
      );
    }

    const log = await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId: entityId || null,
        clientCuit: clientCuit || null,
        clientName: clientName || null,
        fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : null,
        details: details || null,
        // userId se llenará cuando implementemos autenticación
      },
    });

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al registrar evento de auditoría: ${err.message}` },
      { status: 500 }
    );
  }
}
