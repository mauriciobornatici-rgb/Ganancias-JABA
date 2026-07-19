export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

/**
 * Configuración del backup automático local (fila única).
 * La app solo GUARDA la configuración; la ejecución la hace el runner
 * (scripts/backup-runner.mjs) en la PC del usuario, que lee esta misma fila
 * y reporta lastRunAt/lastRunStatus/lastRunFile.
 */

const DEFAULTS = {
  enabled: false,
  destinationPath: '',
  frequency: 'DAILY',
  hour: 21,
  weekday: 6,
  retentionDays: 30,
  lastRunAt: null as string | null,
  lastRunStatus: null as string | null,
  lastRunFile: null as string | null,
};

export async function GET() {
  try {
    const config = await prisma.backupConfig.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!config) {
      return NextResponse.json({ success: true, data: DEFAULTS });
    }
    return NextResponse.json({
      success: true,
      data: {
        enabled: config.enabled,
        destinationPath: config.destinationPath,
        frequency: config.frequency,
        hour: config.hour,
        weekday: config.weekday,
        retentionDays: config.retentionDays,
        lastRunAt: config.lastRunAt ? config.lastRunAt.toISOString() : null,
        lastRunStatus: config.lastRunStatus,
        lastRunFile: config.lastRunFile,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo leer la configuración de backup: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Solicitud inválida.' }, { status: 400 });
    }

    const enabled = body.enabled === true;
    const destinationPath = typeof body.destinationPath === 'string' ? body.destinationPath.trim() : '';
    const frequency = body.frequency === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
    const hour = Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23 ? body.hour : null;
    const weekday = Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6 ? body.weekday : 6;
    const retentionDays = Number.isInteger(body.retentionDays) && body.retentionDays >= 1 && body.retentionDays <= 365
      ? body.retentionDays
      : null;

    if (hour === null) {
      return NextResponse.json({ success: false, error: 'La hora debe ser un entero entre 0 y 23.' }, { status: 400 });
    }
    if (retentionDays === null) {
      return NextResponse.json({ success: false, error: 'La retención debe ser un entero entre 1 y 365 días.' }, { status: 400 });
    }
    if (enabled && destinationPath === '') {
      return NextResponse.json(
        { success: false, error: 'Para activar el backup automático hay que indicar la carpeta de destino (por ejemplo, la carpeta de Google Drive de la PC).' },
        { status: 400 },
      );
    }

    const existing = await prisma.backupConfig.findFirst({ orderBy: { createdAt: 'asc' } });
    const data = { enabled, destinationPath, frequency, hour, weekday, retentionDays };
    const saved = existing
      ? await prisma.backupConfig.update({ where: { id: existing.id }, data })
      : await prisma.backupConfig.create({ data });

    await logAuditEvent({
      action: 'UPDATE',
      entityType: 'BackupConfig',
      entityId: saved.id,
      details: `Configuración de backup: ${enabled ? 'ACTIVADO' : 'desactivado'}, destino "${destinationPath}", ${frequency === 'DAILY' ? 'diario' : 'semanal'} a las ${String(hour).padStart(2, '0')}:00, retención ${retentionDays} días.`,
    });

    return NextResponse.json({ success: true, data: { id: saved.id } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo guardar la configuración de backup: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
