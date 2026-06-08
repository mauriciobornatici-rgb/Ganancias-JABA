import { prisma } from '@/domain/ganancias/prisma';

/**
 * Registra un evento de auditoría de forma asíncrona y tolerante a fallos.
 * No propaga errores para no interrumpir la operación principal.
 */
export async function logAuditEvent(params: {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CLOSE' | 'REOPEN' | 'RECTIFY' | 'ANNUL' | 'IMPORT';
  entityType: string;
  entityId?: string | null;
  clientCuit?: string | null;
  clientName?: string | null;
  fiscalYear?: number | null;
  details?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        clientCuit: params.clientCuit || null,
        clientName: params.clientName || null,
        fiscalYear: params.fiscalYear || null,
        details: params.details || null,
        userId: params.userId || null,
      },
    });
  } catch (err) {
    // Log silenciosamente — la auditoría no debe interrumpir operaciones críticas
    console.error('[AuditLog] Error al registrar evento:', err);
  }
}
