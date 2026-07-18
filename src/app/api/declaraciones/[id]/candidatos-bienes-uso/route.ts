export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { isTaxReturnEditable } from '@/domain/ganancias/workflow/taxReturnWorkflow';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

type RouteContext = { params: Promise<{ id: string }> };

const CANDIDATE_ACTIONS = {
  CONFIRM: 'CONFIRMED',
  DISMISS: 'DISMISSED',
  REOPEN: 'PENDING',
} as const;

type CandidateAction = keyof typeof CANDIDATE_ACTIONS;

/**
 * Candidatos a bienes de uso detectados por la importación del libro mensual.
 * GET lista todos los del taxReturn; PATCH confirma/descarta/reabre uno.
 * El circuito completo: importar → candidato PENDING → "Agregar como bien de uso"
 * (crea la fila en el Paso 4 y marca CONFIRMED) o "Descartar" (DISMISSED).
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: taxReturnId } = await context.params;

  try {
    const candidates = await prisma.fixedAssetImportCandidate.findMany({
      where: { taxReturnId },
      orderBy: [{ sourceMonth: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        sourceMonth: true,
        description: true,
        counterpartyName: true,
        purchaseDate: true,
        originalCost: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: candidates.map(candidate => ({
        id: candidate.id,
        sourceMonth: candidate.sourceMonth,
        description: candidate.description,
        counterpartyName: candidate.counterpartyName,
        purchaseDate: candidate.purchaseDate.toISOString().slice(0, 10),
        originalCost: candidate.originalCost.toString(),
        status: candidate.status,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudieron listar los candidatos a bienes de uso: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = await requireRouteAuth(request);
  if (authError) return authError;
  const { id: taxReturnId } = await context.params;

  try {
    const body = await request.json().catch(() => null);
    const candidateId = typeof body?.candidateId === 'string' ? body.candidateId : null;
    const action = typeof body?.action === 'string' && body.action in CANDIDATE_ACTIONS
      ? (body.action as CandidateAction)
      : null;

    if (!candidateId || !action) {
      return NextResponse.json(
        { success: false, error: 'Solicitud inválida: se requiere candidateId y una acción CONFIRM, DISMISS o REOPEN.' },
        { status: 400 },
      );
    }

    const taxReturn = await prisma.taxReturn.findUnique({
      where: { id: taxReturnId },
      select: { id: true, status: true, client: { select: { cuit: true, name: true } }, fiscalYear: { select: { year: true } } },
    });
    if (!taxReturn) {
      return NextResponse.json({ success: false, error: 'La declaración no existe.' }, { status: 404 });
    }
    if (!isTaxReturnEditable(taxReturn.status)) {
      return NextResponse.json(
        { success: false, error: `La declaración está en estado ${taxReturn.status} y es inmutable. Reabrila con motivo antes de modificar candidatos.` },
        { status: 409 },
      );
    }

    const updated = await prisma.fixedAssetImportCandidate.updateMany({
      where: { id: candidateId, taxReturnId },
      data: { status: CANDIDATE_ACTIONS[action] },
    });
    if (updated.count !== 1) {
      return NextResponse.json(
        { success: false, error: 'El candidato no existe o no pertenece a esta declaración.' },
        { status: 404 },
      );
    }

    await logAuditEvent({
      action: 'UPDATE',
      entityType: 'FixedAssetImportCandidate',
      entityId: candidateId,
      clientCuit: taxReturn.client?.cuit,
      clientName: taxReturn.client?.name,
      fiscalYear: taxReturn.fiscalYear?.year,
      details: `Candidato a bien de uso ${candidateId}: ${action} → ${CANDIDATE_ACTIONS[action]}.`,
    });

    return NextResponse.json({ success: true, data: { id: candidateId, status: CANDIDATE_ACTIONS[action] } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo actualizar el candidato: ${messageOf(error)}` },
      { status: 500 },
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
