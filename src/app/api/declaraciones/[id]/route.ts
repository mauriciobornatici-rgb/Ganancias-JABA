import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { persistTaxReturnDetails } from '@/domain/ganancias/persistence/taxReturnDetailsPersistence';
import { formatDateForWizardInput } from '@/domain/ganancias/persistence/taxReturnReadMapper';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Buscar la declaración en la base de datos junto con todas sus tablas hijas
    const taxReturn = await prisma.taxReturn.findUnique({
      where: { id },
      include: {
        client: true,
        fiscalYear: true,
        sales: true,
        purchases: true,
        fixedAssets: true,
        inventory: true,
        bankAccounts: true,
        withholdings: true,
        personalAssets: true,
        personalLiabilities: true,
        axiDynamicItems: true,
        calculations: {
          orderBy: { runDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!taxReturn) {
      return NextResponse.json(
        { success: false, error: 'Declaración jurada no encontrada.' },
        { status: 404 }
      );
    }

    const latestCalc = taxReturn.calculations[0] || null;
    let extraState: any = {};

    if (latestCalc && latestCalc.variablesSnapshot) {
      try {
        extraState = JSON.parse(latestCalc.variablesSnapshot);
      } catch (e) {
        console.error('Error parsing variablesSnapshot', e);
      }
    }

    // Mapear la estructura relacional de la BD al estado plano esperado por el frontend
    const payload = {
      id: taxReturn.id,
      cuit: taxReturn.client.cuit,
      clientName: taxReturn.client.name,
      mainActivity: taxReturn.client.mainActivity,
      fiscalYear: taxReturn.fiscalYear.year,
      status: taxReturn.status,
      version: taxReturn.version,
      taxParameterSetId: taxReturn.taxParameterSetId,
      updatedAt: taxReturn.updatedAt.toISOString(),
      currentStep: extraState.currentStep || 1,
      sales: taxReturn.sales.map((s: any) => ({
        date: formatDateForWizardInput(s.date),
        netAmount: s.netAmount.toString(),
        isExempt: s.isExempt,
      })),
      purchases: taxReturn.purchases.map((p: any) => ({
        date: formatDateForWizardInput(p.date),
        netAmount: p.netAmount.toString(),
        isDeductible: p.isDeductible,
        isExempt: p.isExempt,
        expenseType: p.expenseType || 'GastosGenerales',
      })),
      fixedAssets: taxReturn.fixedAssets.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        purchaseDate: formatDateForWizardInput(a.purchaseDate),
        originalCost: a.originalCost.toString(),
        usefulLife: a.usefulLife,
        yearsElapsed: a.yearsElapsed,
        customReexpIndex: a.customReexpIndex.toString(),
      })),
      initialStock: taxReturn.inventory[0]?.initialStock.toString() || '0',
      finalStock: taxReturn.inventory[0]?.finalStock.toString() || '0',
      bankAccounts: taxReturn.bankAccounts.map((b: any) => ({
        id: b.id,
        name: b.bankName,
        cuitBank: b.cuitBank || '',
        accountNumber: b.accountNumber,
        accountType: b.accountType,
        currency: b.currency,
        nominalInitial: b.nominalBalanceInitial.toString(),
        nominalFinal: b.nominalBalanceFinal.toString(),
        tcInitial: b.tcInitial.toString(),
        tcFinal: b.tcFinal.toString(),
        interests: b.interests.toString(),
      })),
      withholdings: taxReturn.withholdings.map((w: any) => ({
        amount: w.amount.toString(),
        taxCode: w.taxCode,
      })),
      personalAssets: taxReturn.personalAssets.map((a: any) => ({
        description: a.description,
        type: a.type,
        valueInitial: a.valueInitial.toString(),
        valueFinal: a.valueFinal.toString(),
      })),
      personalLiabilities: taxReturn.personalLiabilities.map((l: any) => ({
        description: l.description,
        valueInitial: l.valueInitial.toString(),
        valueFinal: l.valueFinal.toString(),
      })),
      generalDeductions: extraState.generalDeductions || {
        autonomos: '0',
        servicioDomestico: '0',
        seguroVida: '0',
        seguroRetiro: '0',
        gastosSepelio: '0',
        interesesHipoteca: '0',
        gastosEducativos: '0',
        alquilerCasaHabitacion: '0',
        deduccionLocadorLocatario: '0',
        donaciones: '0',
        medicosAsistencial: '0',
        honorariosMedicos: '0',
      },
      personalDeductions: extraState.personalDeductions || {
        tieneConyuge: false,
        cantidadHijos: 0,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Ninguna',
      },
      activoTotalInicio: extraState.activoTotalInicio || '0',
      pasivoTotalInicio: extraState.pasivoTotalInicio || '0',
      bienesNoComputablesInicio: extraState.bienesNoComputablesInicio || '0',
      saldoAFavorAnterior: extraState.saldoAFavorAnterior || '0',
      quebrantosAnteriores: extraState.quebrantosAnteriores || '0',
      axiDynamic: (taxReturn.axiDynamicItems || []).map((a: any) => ({
        concept: a.concept,
        type: a.type,
        amount: a.amount.toString(),
        date: formatDateForWizardInput(a.date)
      })),
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al obtener declaración: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { clientName, status } = body;

    // 1. Validar que la declaración exista
    const existingReturn = await prisma.taxReturn.findUnique({
      where: { id },
      include: { client: true, fiscalYear: true },
    });

    if (!existingReturn) {
      return NextResponse.json(
        { success: false, error: 'Declaración jurada no encontrada para actualizar.' },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx: any) => {
      await persistTaxReturnDetails({
        db: tx,
        taxReturnId: id,
        existingReturn,
        payload: body,
      });
    });
    // Registrar en auditoría
    logAuditEvent({
      action: status === 'Cerrada' ? 'CLOSE' : 'UPDATE',
      entityType: 'TaxReturn',
      entityId: id,
      clientCuit: existingReturn.client?.cuit,
      clientName: clientName,
      fiscalYear: existingReturn.fiscalYear?.year,
      details: `Actualización de DDJJ ${id} — Estado: ${status || existingReturn.status}`,
    });

    return NextResponse.json({ success: true, message: 'Declaración actualizada con éxito en la base de datos.' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al actualizar declaración: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingReturn = await prisma.taxReturn.findUnique({
      where: { id },
    });

    if (!existingReturn) {
      return NextResponse.json(
        { success: false, error: 'Declaración jurada no encontrada para eliminar.' },
        { status: 404 }
      );
    }

    await prisma.taxReturn.delete({
      where: { id },
    });

    // Registrar en auditoría
    logAuditEvent({
      action: 'DELETE',
      entityType: 'TaxReturn',
      entityId: id,
      details: `Eliminación de DDJJ ${id}`,
    });

    return NextResponse.json({
      success: true,
      message: 'Declaración jurada eliminada con éxito de la base de datos.'
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error al eliminar la declaración jurada: ${err.message}` },
      { status: 500 }
    );
  }
}
