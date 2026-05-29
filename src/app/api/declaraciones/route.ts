export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');

    const whereClause: any = {};
    if (clientId) {
      whereClause.clientId = clientId;
    }

    const taxReturns = await prisma.taxReturn.findMany({
      where: whereClause,
      include: {
        client: true,
        fiscalYear: true,
        calculations: {
          orderBy: { runDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Mapear al formato plano que espera la interfaz de usuario
    const mapped = taxReturns.map((r: any) => {
      const latestCalc = r.calculations[0] || null;
      return {
        id: r.id,
        clientId: r.clientId,
        clientName: r.client.name,
        cuit: r.client.cuit,
        year: r.fiscalYear.year,
        status: r.status,
        version: r.version,
        updatedAt: r.updatedAt.toISOString().replace('T', ' ').substring(0, 16),
        impuestoAPagar: latestCalc ? latestCalc.finalBalance : 0,
        consumoCalculado: latestCalc ? latestCalc.computedConsumo : 0,
        hasWarnings: latestCalc ? latestCalc.hasErrors : false,
        currentStep: latestCalc && latestCalc.variablesSnapshot ? JSON.parse(latestCalc.variablesSnapshot).currentStep || 1 : 1,
      };
    });

    return NextResponse.json({ success: true, data: mapped });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al obtener declaraciones: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cuit, clientName, fiscalYear, status, currentStep, taxParameterSetId } = body;

    if (!cuit || !clientName || !fiscalYear) {
      return NextResponse.json(
        { success: false, error: 'CUIT, nombre de cliente y año fiscal son obligatorios.' },
        { status: 400 }
      );
    }

    // 1. Buscar el Cliente
    const client = await prisma.client.findUnique({
      where: { cuit },
    });

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'El contribuyente ingresado no se encuentra registrado en el padrón de Clientes. Debe registrarlo previamente en la sección de Clientes.' },
        { status: 400 }
      );
    }

    // 2. Buscar o crear el FiscalYear
    const yearInt = parseInt(fiscalYear, 10);
    let fYear = await prisma.fiscalYear.findUnique({
      where: { year: yearInt },
    });

    if (!fYear) {
      fYear = await prisma.fiscalYear.create({
        data: {
          year: yearInt,
          isEnabled: true,
        },
      });
    }

    // 3. Crear la Declaración Jurada original (version 0)
    const taxReturn = await prisma.taxReturn.create({
      data: {
        clientId: client.id,
        fiscalYearId: fYear.id,
        status: status || 'Borrador',
        version: 0,
        taxParameterSetId: taxParameterSetId || null,
      },
    });

    // 4. Crear un CalculationRun vacío inicial para guardar metadatos de pasos
    await prisma.calculationRun.create({
      data: {
        taxReturnId: taxReturn.id,
        resultThirdCategory: 0,
        resultTotalNet: 0,
        totalGeneralDeductions: 0,
        impositiveResultBeforeQuebrantos: 0,
        quebrantosApplied: 0,
        impositiveResultNet: 0,
        totalPersonalDeductions: 0,
        taxableIncome: 0,
        taxDetermined: 0,
        totalPaymentsOnAccount: 0,
        finalBalance: 0,
        computedConsumo: 0,
        justificationDiff: 0,
        axiStaticResult: 0,
        axiDynamicResult: 0,
        axiNetAdjustment: 0,
        variablesSnapshot: JSON.stringify({ currentStep: currentStep || 1 }),
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: taxReturn.id,
          clientId: client.id,
          clientName: client.name,
          cuit: client.cuit,
          year: fYear.year,
          status: taxReturn.status,
          version: taxReturn.version,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al crear declaración: ${err.message}` },
      { status: 500 }
    );
  }
}
