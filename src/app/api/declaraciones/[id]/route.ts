import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';
import { persistTaxReturnDetails } from '@/domain/ganancias/persistence/taxReturnDetailsPersistence';
import {
  formatDateForWizardInput,
  mapAxiStaticItemsForWizard,
  mapAxiDynamicItemForWizard,
  mapPatrimonialJustificationForWizard,
  snapshotStringAt,
} from '@/domain/ganancias/persistence/taxReturnReadMapper';
import {
  buildTaxReturnAnnulmentDecision,
  buildTaxReturnUpdateDecision,
} from '@/domain/ganancias/workflow/taxReturnWorkflow';
import { MAX_DECLARATION_PAYLOAD_BYTES, exceedsContentLength } from '@/domain/ganancias/presentation/apiValidation';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Buscar la declaracion en la base de datos junto con todas sus tablas hijas.
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
        cashHoldings: true,
        receivables: true,
        liabilities: true,
        withholdings: true,
        personalAssets: true,
        personalLiabilities: true,
        justifications: true,
        generalDeduction: true,
        personalDeduction: true,
        axiStaticItems: true,
        axiDynamicItems: true,
        calculations: {
          orderBy: { runDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!taxReturn) {
      return NextResponse.json(
        { success: false, error: 'Declaracion jurada no encontrada.' },
        { status: 404 }
      );
    }

    const latestCalc = taxReturn.calculations[0] || null;
    let extraState: Record<string, unknown> = {};

    if (latestCalc && latestCalc.variablesSnapshot) {
      try {
        extraState = JSON.parse(latestCalc.variablesSnapshot);
      } catch (e) {
        console.error('Error parsing variablesSnapshot', e);
      }
    }

    const dbGeneralDeductions = taxReturn.generalDeduction
      ? {
          autonomos: taxReturn.generalDeduction.autonomos.toString(),
          servicioDomestico: taxReturn.generalDeduction.servicioDomestico.toString(),
          seguroVida: taxReturn.generalDeduction.seguroVida.toString(),
          seguroRetiro: taxReturn.generalDeduction.seguroRetiro.toString(),
          gastosSepelio: taxReturn.generalDeduction.gastosSepelio.toString(),
          interesesHipoteca: taxReturn.generalDeduction.interesesHipoteca.toString(),
          gastosEducativos: taxReturn.generalDeduction.gastosEducativos.toString(),
          alquilerCasaHabitacion: taxReturn.generalDeduction.alquilerCasaHabitacion.toString(),
          deduccionLocadorLocatario: taxReturn.generalDeduction.deduccionLocadorLocatario.toString(),
          donaciones: taxReturn.generalDeduction.donaciones.toString(),
          medicosAsistencial: taxReturn.generalDeduction.medicosAsistencial.toString(),
          honorariosMedicos: taxReturn.generalDeduction.honorariosMedicos.toString(),
        }
      : null;
    const dbPersonalDeductions = taxReturn.personalDeduction
      ? {
          tieneConyuge: taxReturn.personalDeduction.tieneConyuge,
          cantidadHijos: taxReturn.personalDeduction.cantidadHijos,
          cantidadHijosIncapacitados: taxReturn.personalDeduction.cantidadHijosIncapacitados,
          tipoDeduccionEspecial: taxReturn.personalDeduction.tipoDeduccionEspecial,
          esJubiladoOchoHaberes: taxReturn.personalDeduction.esJubiladoOchoHaberes,
        }
      : null;
    const dbAxiStaticBreakdown = mapAxiStaticItemsForWizard(taxReturn.axiStaticItems || []);

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
      sales: taxReturn.sales.map((s, index) => ({
        date: formatDateForWizardInput(s.date),
        netAmount: s.netAmount.toString(),
        isExempt: s.isExempt,
        invoiceType: s.invoiceType,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        counterpartyCuit: s.counterpartyCuit || snapshotStringAt(extraState.sales, index, 'counterpartyCuit'),
        ivaAmount: s.ivaAmount.toString(),
        totalAmount: s.totalAmount.toString(),
      })),
      purchases: taxReturn.purchases.map((p, index) => ({
        date: formatDateForWizardInput(p.date),
        netAmount: p.netAmount.toString(),
        isDeductible: p.isDeductible,
        isExempt: p.isExempt,
        expenseType: p.expenseType || 'GastosGenerales',
        invoiceType: p.invoiceType,
        invoiceNumber: p.invoiceNumber,
        vendorName: p.vendorName,
        counterpartyCuit: p.counterpartyCuit || snapshotStringAt(extraState.purchases, index, 'counterpartyCuit'),
        ivaAmount: p.ivaAmount.toString(),
        totalAmount: p.totalAmount.toString(),
      })),
      fixedAssets: taxReturn.fixedAssets.map((a, index) => {
        const extraAsset = Array.isArray(extraState.fixedAssets)
          ? (extraState.fixedAssets.find((ea: any) => ea && ea.id === a.id) || extraState.fixedAssets[index])
          : null;
        const isRetired = a.isRetired || (extraAsset && (extraAsset.isRetired === true || extraAsset.isRetired === 'true'));
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          purchaseDate: formatDateForWizardInput(a.purchaseDate),
          originalCost: a.originalCost.toString(),
          usefulLife: a.usefulLife,
          yearsElapsed: a.yearsElapsed,
          customReexpIndex: a.customReexpIndex.toString(),
          isRetired: !!isRetired,
        };
      }),
      initialStock: taxReturn.inventory[0]?.initialStock.toString() || '0',
      finalStock: taxReturn.inventory[0]?.finalStock.toString() || '0',
      bankAccounts: taxReturn.bankAccounts.map(b => ({
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
      cashHoldings: taxReturn.cashHoldings.map(c => ({
        currency: c.currency,
        nominalInitial: c.nominalInitial.toString(),
        nominalFinal: c.nominalFinal.toString(),
        tcFinal: c.tcFinal.toString(),
      })),
      receivables: taxReturn.receivables.map(r => ({
        description: r.description,
        type: r.type,
        balanceInitial: r.balanceInitial.toString(),
        balanceFinal: r.balanceFinal.toString(),
      })),
      liabilities: taxReturn.liabilities.map(l => ({
        description: l.description,
        type: l.type,
        balanceInitial: l.balanceInitial.toString(),
        balanceFinal: l.balanceFinal.toString(),
      })),
      withholdings: taxReturn.withholdings.map(w => ({
        amount: w.amount.toString(),
        taxCode: w.taxCode,
        cuitAgent: w.cuitAgent || '',
        agentName: w.agentName || '',
        taxDescription: w.taxDescription || '',
        regimeCode: w.regimeCode || '',
        regimeDescription: w.regimeDescription || '',
        date: formatDateForWizardInput(w.date),
        certificateNumber: w.certificateNumber || '',
        operationDescription: w.operationDescription || '',
      })),
      personalAssets: taxReturn.personalAssets.map((a, index) => ({
        description: a.description,
        type: a.type,
        valueInitial: a.valueInitial.toString(),
        valueFinal: a.valueFinal.toString(),
        detail: snapshotStringAt(extraState.personalAssets, index, 'detail'),
      })),
      personalLiabilities: taxReturn.personalLiabilities.map(l => ({
        description: l.description,
        valueInitial: l.valueInitial.toString(),
        valueFinal: l.valueFinal.toString(),
      })),
      generalDeductions: dbGeneralDeductions || extraState.generalDeductions || {
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
      personalDeductions: dbPersonalDeductions || extraState.personalDeductions || {
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
      otherJustifications: taxReturn.justifications.length > 0
        ? taxReturn.justifications.map(mapPatrimonialJustificationForWizard)
        : extraState.otherJustifications || [],
      axiDynamic: (taxReturn.axiDynamicItems || []).map(mapAxiDynamicItemForWizard),
      autoCalcInitialBalances: extraState.autoCalcInitialBalances !== undefined
        ? extraState.autoCalcInitialBalances === true
        : !(
            (Number(extraState.activoTotalInicio || 0) > 0 || Number(extraState.pasivoTotalInicio || 0) > 0) &&
            (taxReturn.bankAccounts.length === 0 && taxReturn.receivables.length === 0 && taxReturn.liabilities.length === 0 && taxReturn.fixedAssets.length === 0)
          ),
      axiStaticBreakdown: dbAxiStaticBreakdown || extraState.axiStaticBreakdown || null,
    };

    return NextResponse.json({ success: true, data: payload });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al obtener declaracion: ${errorMessage(err)}` },
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

    // P31.4: tope de tamano del payload de guardado (un snapshot legitimo no llega a esto).
    if (exceedsContentLength(req.headers.get('content-length'), MAX_DECLARATION_PAYLOAD_BYTES)) {
      return NextResponse.json(
        { success: false, error: 'El payload de la declaracion supera el tamano maximo permitido (6 MB).' },
        { status: 413 }
      );
    }

    const body = await req.json();
    const { clientName, status, workflowAction, workflowReason } = body;

    const existingReturn = await prisma.taxReturn.findUnique({
      where: { id },
      include: { client: true, fiscalYear: true },
    });

    if (!existingReturn) {
      return NextResponse.json(
        { success: false, error: 'Declaracion jurada no encontrada para actualizar.' },
        { status: 404 }
      );
    }

    const workflowDecision = buildTaxReturnUpdateDecision({
      currentStatus: existingReturn.status,
      requestedStatus: status,
      workflowAction,
      workflowReason,
    });

    if (!workflowDecision.allowed) {
      return NextResponse.json(
        { success: false, error: workflowDecision.error },
        { status: workflowDecision.httpStatus }
      );
    }

    if (!workflowDecision.persistDetails) {
      await prisma.taxReturn.update({
        where: { id },
        data: {
          status: workflowDecision.nextStatus,
          notes: appendWorkflowNote(existingReturn.notes, 'REAPERTURA', workflowDecision.reason || ''),
          updatedAt: new Date(),
        },
      });

      logAuditEvent({
        action: workflowDecision.auditAction,
        entityType: 'TaxReturn',
        entityId: id,
        clientCuit: existingReturn.client?.cuit,
        clientName: clientName || existingReturn.client?.name,
        fiscalYear: existingReturn.fiscalYear?.year,
        details: `Reapertura de DDJJ ${id}. Motivo: ${workflowDecision.reason}`,
      });

      return NextResponse.json({
        success: true,
        message: 'Declaracion reabierta como Borrador. Ya puede editarse con control de auditoria.',
      });
    }

    await prisma.$transaction(async tx => {
      await persistTaxReturnDetails({
        db: tx,
        taxReturnId: id,
        existingReturn,
        payload: {
          ...body,
          status: workflowDecision.nextStatus,
        },
      });
    });

    logAuditEvent({
      action: workflowDecision.auditAction,
      entityType: 'TaxReturn',
      entityId: id,
      clientCuit: existingReturn.client?.cuit,
      clientName: clientName || existingReturn.client?.name,
      fiscalYear: existingReturn.fiscalYear?.year,
      details: `Actualizacion de DDJJ ${id} - Estado: ${workflowDecision.nextStatus}`,
    });

    return NextResponse.json({ success: true, message: 'Declaracion actualizada con exito en la base de datos.' });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al actualizar declaracion: ${errorMessage(err)}` },
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
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get('reason') || '';
    const isTechnicalRollback = req.headers.get('x-jaba-rollback') === 'true';

    const existingReturn = await prisma.taxReturn.findUnique({
      where: { id },
      include: {
        client: true,
        fiscalYear: true,
      },
    });

    if (!existingReturn) {
      return NextResponse.json(
        { success: false, error: 'Declaracion jurada no encontrada para anular.' },
        { status: 404 }
      );
    }

    const annulmentDecision = buildTaxReturnAnnulmentDecision({
      currentStatus: existingReturn.status,
      reason,
      isTechnicalRollback,
    });

    if (!annulmentDecision.allowed) {
      return NextResponse.json(
        { success: false, error: annulmentDecision.error },
        { status: annulmentDecision.httpStatus }
      );
    }

    if (annulmentDecision.mode === 'physical-delete') {
      await prisma.taxReturn.delete({
        where: { id },
      });

      logAuditEvent({
        action: annulmentDecision.auditAction,
        entityType: 'TaxReturn',
        entityId: id,
        clientCuit: existingReturn.client?.cuit,
        clientName: existingReturn.client?.name,
        fiscalYear: existingReturn.fiscalYear?.year,
        details: annulmentDecision.reason,
      });

      return NextResponse.json({
        success: true,
        message: 'Rollback tecnico ejecutado: cabecera borrador eliminada fisicamente.',
      });
    }

    await prisma.taxReturn.update({
      where: { id },
      data: {
        status: annulmentDecision.nextStatus,
        notes: appendWorkflowNote(existingReturn.notes, 'ANULACION', annulmentDecision.reason),
        updatedAt: new Date(),
      },
    });

    logAuditEvent({
      action: annulmentDecision.auditAction,
      entityType: 'TaxReturn',
      entityId: id,
      clientCuit: existingReturn.client?.cuit,
      clientName: existingReturn.client?.name,
      fiscalYear: existingReturn.fiscalYear?.year,
      details: `Anulacion operativa de DDJJ ${id}. Motivo: ${annulmentDecision.reason}`,
    });

    return NextResponse.json({
      success: true,
      message: 'Declaracion jurada anulada con exito. No fue borrada de la base de datos.',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al anular la declaracion jurada: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function appendWorkflowNote(previous: string | null | undefined, label: string, reason: string): string {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const line = `[${timestamp}] ${label}: ${reason}`;
  return previous ? `${previous}\n${line}` : line;
}
