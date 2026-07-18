import { NextRequest, NextResponse } from 'next/server';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import { prisma } from '@/domain/ganancias/prisma';
import { persistTaxReturnDetails } from '@/domain/ganancias/persistence/taxReturnDetailsPersistence';
import {
  TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS,
  TaxReturnInvalidPayloadError,
  isPrismaUniqueConstraintError,
} from '@/domain/ganancias/persistence/taxReturnPersistencePolicy';
import {
  formatDateForWizardInput,
  mapAxiStaticItemsForWizard,
  mapAxiDynamicItemForWizard,
  mapPatrimonialJustificationForWizard,
  snapshotStringAt,
} from '@/domain/ganancias/persistence/taxReturnReadMapper';
import {
  buildTaxReturnAnnulmentDecision,
  buildTaxReturnStaleWriteDecision,
  buildTaxReturnUpdateDecision,
} from '@/domain/ganancias/workflow/taxReturnWorkflow';
import { MAX_DECLARATION_PAYLOAD_BYTES, exceedsContentLength } from '@/domain/ganancias/presentation/apiValidation';
import { DEFAULT_PURCHASE_EXPENSE_TYPE } from '@/domain/ganancias/purchaseExpenseType';

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
        fixedAssetImportCandidates: { where: { status: 'PENDING' }, orderBy: { purchaseDate: 'asc' } },
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
        saleCategory: s.saleCategory,
        isComputable: s.isComputable,
        invoiceType: s.invoiceType,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        counterpartyCuit: s.counterpartyCuit || snapshotStringAt(extraState.sales, index, 'counterpartyCuit'),
        ivaAmount: s.ivaAmount.toString(),
        totalAmount: s.totalAmount.toString(),
        importSource: s.importSource || undefined,
        sourceFiscalDocumentId: s.sourceFiscalDocumentId || undefined,
      })),
      purchases: taxReturn.purchases.map((p, index) => ({
        date: formatDateForWizardInput(p.date),
        netAmount: p.netAmount.toString(),
        isDeductible: p.isDeductible,
        isExempt: p.isExempt,
        expenseType: p.expenseType || DEFAULT_PURCHASE_EXPENSE_TYPE,
        invoiceType: p.invoiceType,
        invoiceNumber: p.invoiceNumber,
        vendorName: p.vendorName,
        counterpartyCuit: p.counterpartyCuit || snapshotStringAt(extraState.purchases, index, 'counterpartyCuit'),
        ivaAmount: p.ivaAmount.toString(),
        totalAmount: p.totalAmount.toString(),
        importSource: p.importSource || undefined,
        sourceFiscalDocumentId: p.sourceFiscalDocumentId || undefined,
      })),
      fixedAssetImportCandidates: taxReturn.fixedAssetImportCandidates.map(candidate => ({
        id: candidate.id,
        sourceFiscalDocumentId: candidate.sourceFiscalDocumentId,
        month: candidate.sourceMonth,
        description: candidate.description,
        counterpartyName: candidate.counterpartyName,
        cost: candidate.originalCost.toString(),
        date: formatDateForWizardInput(candidate.purchaseDate),
        status: candidate.status,
      })),
      fixedAssets: taxReturn.fixedAssets.map((a, index) => {
        const extraAssetSnapshot = Array.isArray(extraState.fixedAssets)
          ? (extraState.fixedAssets.find((ea) => isRecord(ea) && ea.id === a.id) || extraState.fixedAssets[index])
          : null;
        const extraAsset = isRecord(extraAssetSnapshot) ? extraAssetSnapshot : null;
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
  const authError = await requireRouteAuth(req);
  if (authError) return authError;
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
    const { clientName, status, workflowAction, workflowReason, lastKnownUpdatedAt } = body;

    if (typeof lastKnownUpdatedAt !== 'string' || !Number.isFinite(Date.parse(lastKnownUpdatedAt))) {
      return NextResponse.json(
        { success: false, error: 'Falta la versión de la DDJJ cargada. Recargue antes de guardar.', code: 'MISSING_TAX_RETURN_VERSION' },
        { status: 400 },
      );
    }

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
      const reopenedReturn = await prisma.$transaction(async tx => {
        const reserved = await tx.taxReturn.updateMany({
          where: { id, updatedAt: new Date(lastKnownUpdatedAt) },
          data: { updatedAt: new Date() },
        });
        if (reserved.count !== 1) throw new StaleTaxReturnWriteError();

        const updated = await tx.taxReturn.update({
          where: { id },
          data: {
            status: workflowDecision.nextStatus,
            notes: appendWorkflowNote(existingReturn.notes, 'REAPERTURA', workflowDecision.reason || ''),
            updatedAt: new Date(),
          },
        });
        await tx.auditLog.create({ data: {
          action: workflowDecision.auditAction,
          entityType: 'TaxReturn',
          entityId: id,
          clientCuit: existingReturn.client?.cuit,
          clientName: clientName || existingReturn.client?.name,
          fiscalYear: existingReturn.fiscalYear?.year,
          details: `Reapertura de DDJJ ${id}. Motivo: ${workflowDecision.reason}`,
        } });
        return updated;
      });

      return NextResponse.json({
        success: true,
        message: 'Declaracion reabierta como Borrador. Ya puede editarse con control de auditoria.',
        data: {
          updatedAt: reopenedReturn.updatedAt.toISOString(),
          status: reopenedReturn.status,
        },
      });
    }

    const staleDecision = buildTaxReturnStaleWriteDecision({
      lastKnownUpdatedAt: typeof lastKnownUpdatedAt === 'string' ? lastKnownUpdatedAt : null,
      currentUpdatedAt: existingReturn.updatedAt,
    });
    if (!staleDecision.allowed) {
      return NextResponse.json({
        success: false,
        error: staleDecision.error,
        code: staleDecision.code,
        data: {
          updatedAt: staleDecision.currentUpdatedAt,
        },
      }, { status: staleDecision.httpStatus });
    }

    const savedReturn = await prisma.$transaction(async tx => {
      const reserved = await tx.taxReturn.updateMany({
        where: { id, updatedAt: new Date(lastKnownUpdatedAt) },
        data: { updatedAt: new Date() },
      });
      if (reserved.count !== 1) throw new StaleTaxReturnWriteError();

      await persistTaxReturnDetails({
        db: tx,
        taxReturnId: id,
        existingReturn,
        payload: {
          ...body,
          status: workflowDecision.nextStatus,
        },
      });

      await tx.auditLog.create({ data: {
        action: workflowDecision.auditAction,
        entityType: 'TaxReturn',
        entityId: id,
        clientCuit: existingReturn.client?.cuit,
        clientName: clientName || existingReturn.client?.name,
        fiscalYear: existingReturn.fiscalYear?.year,
        details: `Actualización de DDJJ ${id} - Estado: ${workflowDecision.nextStatus}`,
      } });

      return tx.taxReturn.findUnique({
        where: { id },
        select: {
          status: true,
          version: true,
          updatedAt: true,
        },
      });
    }, TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS);

    return NextResponse.json({
      success: true,
      message: 'Declaracion actualizada con exito en la base de datos.',
      data: savedReturn ? {
        updatedAt: savedReturn.updatedAt.toISOString(),
        status: savedReturn.status,
        version: savedReturn.version,
      } : undefined,
    });
  } catch (err: unknown) {
    if (err instanceof StaleTaxReturnWriteError) {
      return NextResponse.json(
        {
          success: false,
          error: 'La DDJJ fue modificada en otra ventana o equipo. Recargue antes de sobrescribir datos.',
          code: 'STALE_TAX_RETURN',
        },
        { status: 409 },
      );
    }
    if (err instanceof TaxReturnInvalidPayloadError) {
      return NextResponse.json(
        { success: false, error: err.message, code: 'INVALID_TAX_RETURN_PAYLOAD', fieldPath: err.fieldPath },
        { status: 400 }
      );
    }
    if (isPrismaUniqueConstraintError(err)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Se detecto una colision interna al guardar el borrador. La copia local sigue disponible; reintente y, si persiste, informe el incidente.',
          code: 'PERSISTENCE_ID_CONFLICT',
        },
        { status: 409 }
      );
    }

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
  const authError = await requireRouteAuth(req);
  if (authError) return authError;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get('reason') || '';

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
    });

    if (!annulmentDecision.allowed) {
      return NextResponse.json(
        { success: false, error: annulmentDecision.error },
        { status: annulmentDecision.httpStatus }
      );
    }

    await prisma.$transaction([
      prisma.taxReturn.update({
        where: { id },
        data: {
          status: annulmentDecision.nextStatus,
          notes: appendWorkflowNote(existingReturn.notes, 'ANULACION', annulmentDecision.reason),
          updatedAt: new Date(),
        },
      }),
      prisma.auditLog.create({ data: {
        action: annulmentDecision.auditAction,
        entityType: 'TaxReturn',
        entityId: id,
        clientCuit: existingReturn.client?.cuit,
        clientName: existingReturn.client?.name,
        fiscalYear: existingReturn.fiscalYear?.year,
        details: `Anulación operativa de DDJJ ${id}. Motivo: ${annulmentDecision.reason}`,
      } }),
    ]);

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

class StaleTaxReturnWriteError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function appendWorkflowNote(previous: string | null | undefined, label: string, reason: string): string {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const line = `[${timestamp}] ${label}: ${reason}`;
  return previous ? `${previous}\n${line}` : line;
}
