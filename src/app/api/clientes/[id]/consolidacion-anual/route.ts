export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { readAnnualConsolidation, serializeAnnualConsolidation } from '@/domain/ganancias/persistence/annualConsolidationRead';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Consolidación anual del libro fiscal mensual hacia Ganancias 3ª categoría.
 *
 * Devuelve, para un año, la compuerta de cotejo (qué meses están CLOSED y cuáles bloquean), los
 * totales por categoría de Ganancias de los meses habilitados y el detalle de comprobantes pendientes
 * de revisar su imputación. Solo los meses con IVA cotejado (CLOSED) aportan valores.
 *
 * Uso: GET /api/clientes/:id/consolidacion-anual?year=2025
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: clientId } = await context.params;
  const yearParam = request.nextUrl.searchParams.get('year');
  const year = Number(yearParam);

  if (!yearParam || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { success: false, error: 'Indicá un año válido (?year=AAAA).' },
      { status: 400 },
    );
  }

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, cuit: true } });
    if (!client) {
      return NextResponse.json({ success: false, error: 'El contribuyente no existe.' }, { status: 404 });
    }

    const assembly = await readAnnualConsolidation(prisma, clientId, year);

    return NextResponse.json({
      success: true,
      data: {
        client,
        year,
        ...serializeAnnualConsolidation(assembly),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo consolidar el año: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
