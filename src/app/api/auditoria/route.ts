export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/generated/client/client';
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
    const where: Prisma.AuditLogWhereInput = {};
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
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al obtener registros de auditoría: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
