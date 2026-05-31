import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { calculateTaxReturn } from '@/domain/ganancias/calculations/determinacionImpuesto';
import { calculateFixedAssetDepreciation } from '@/domain/ganancias/calculations/amortizaciones';
import { TaxReturnCalculationInput } from '@/domain/ganancias/types';
import { Decimal } from 'decimal.js';
import { logAuditEvent } from '@/domain/ganancias/auditHelper';

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
        date: s.date.toISOString().split('T')[0],
        netAmount: s.netAmount.toString(),
        isExempt: s.isExempt,
      })),
      purchases: taxReturn.purchases.map((p: any) => ({
        date: p.date.toISOString().split('T')[0],
        netAmount: p.netAmount.toString(),
        isDeductible: p.isDeductible,
        isExempt: p.isExempt,
        expenseType: p.expenseType || 'GastosGenerales',
      })),
      fixedAssets: taxReturn.fixedAssets.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        purchaseDate: a.purchaseDate.toISOString().split('T')[0],
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
        date: a.date.toISOString().split('T')[0]
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

    const {
      cuit,
      clientName,
      fiscalYear,
      currentStep,
      taxParameterSetId,
      sales = [],
      purchases = [],
      fixedAssets = [],
      initialStock = '0',
      finalStock = '0',
      bankAccounts = [],
      withholdings = [],
      generalDeductions,
      personalDeductions,
      personalAssets = [],
      personalLiabilities = [],
      activoTotalInicio = '0',
      pasivoTotalInicio = '0',
      bienesNoComputablesInicio = '0',
      saldoAFavorAnterior = '0',
      quebrantosAnteriores = '0',
      axiDynamic = [],
      status,
    } = body;

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

    // 2. Determinar la resolución (parameterSet) aplicable y cargarla dinámicamente
    let activeResId = taxParameterSetId || existingReturn.taxParameterSetId;
    let dbParamSet = null;
    if (activeResId) {
      dbParamSet = await prisma.taxParameterSet.findUnique({
        where: { id: activeResId }
      });
    }

    // Fallback al último parameterSet de este año fiscal si no se especificó o no se encontró
    if (!dbParamSet) {
      dbParamSet = await prisma.taxParameterSet.findFirst({
        where: { fiscalYear: { year: parseInt(fiscalYear || existingReturn.fiscalYear.year, 10) } },
        orderBy: { version: 'desc' }
      });
    }

    if (!dbParamSet) {
      return NextResponse.json(
        { success: false, error: `No se encontraron parámetros impositivos registrados en la base de datos para el año ${fiscalYear}. Sincronice o suba una resolución primero en la pestaña de Parámetros.` },
        { status: 400 }
      );
    }

    // Cargar brackets asociados a la resolución o año fiscal
    const dbBrackets = await prisma.taxArt94Bracket.findMany({
      where: {
        OR: [
          { taxParameterSetId: dbParamSet.id },
          { fiscalYearId: existingReturn.fiscalYearId, taxParameterSetId: null }
        ]
      }
    });

    // Cargar índices IPC del año fiscal
    const dbIpcIndices = await prisma.updateIndex.findMany({
      where: { fiscalYearId: existingReturn.fiscalYearId },
      orderBy: { monthIndex: 'asc' },
    });

    // 2. Ejecutar cálculo impositivo localmente con el motor puro impositivo
    const calculationInput: TaxReturnCalculationInput = {
      clientName: clientName || existingReturn.client.name,
      cuit: cuit || existingReturn.client.cuit,
      fiscalYear: parseInt(fiscalYear || existingReturn.fiscalYear.year, 10),
      params: {
        year: parseInt(fiscalYear || existingReturn.fiscalYear.year, 10),
        deduccionesArt30: {
          minimoNoImponible: new Decimal(dbParamSet.minimoNoImponible),
          conyuge: new Decimal(dbParamSet.conyuge),
          hijo: new Decimal(dbParamSet.hijo),
          hijoIncapacitado: new Decimal(dbParamSet.hijoIncapacitado),
          especialAutonomo: new Decimal(dbParamSet.especialAutonomo),
          especialEmprendedor: new Decimal(dbParamSet.especialEmprendedor),
          especialDependiente: new Decimal(dbParamSet.especialDependiente),
        },
        topesDeduccionesGenerales: {
          topeServicioDomestico: new Decimal(dbParamSet.topeServicioDomestico),
          topeSeguroVida: new Decimal(dbParamSet.topeSeguroVida),
          topeSeguroRetiro: new Decimal(dbParamSet.topeSeguroRetiro),
          topeGastosSepelio: new Decimal(dbParamSet.topeGastosSepelio),
          topeInteresHipoteca: new Decimal(dbParamSet.topeInteresHipoteca),
          topeGastosEducativos: new Decimal(dbParamSet.topeGastosEducativos),
        },
        escalaArt94: dbBrackets.map((b: any) => ({
          fromAmount: new Decimal(b.fromAmount),
          toAmount: b.toAmount ? new Decimal(b.toAmount) : null,
          fixedAmount: new Decimal(b.fixedAmount),
          percentage: new Decimal(b.percentage),
          excessOf: new Decimal(b.excessOf),
        })),
        indicesIPC: dbIpcIndices.map((i: any) => ({
          monthIndex: i.monthIndex,
          ipcValue: new Decimal(i.ipcValue),
        })),
      },
      sales: sales.map((s: any) => ({
        date: new Date(s.date),
        netAmount: new Decimal(s.netAmount || 0),
        isExempt: s.isExempt || false,
      })),
      purchases: purchases.map((p: any) => ({
        date: new Date(p.date),
        netAmount: new Decimal(p.netAmount || 0),
        isDeductible: p.isDeductible !== false,
        isExempt: p.isExempt || false,
        expenseType: p.expenseType || 'GastosGenerales',
      })),
      fixedAssets: fixedAssets.map((a: any) => ({
        id: a.id,
        name: a.name || '',
        type: a.type || 'Otro',
        purchaseDate: new Date(a.purchaseDate || new Date()),
        originalCost: new Decimal(a.originalCost || 0),
        usefulLife: parseInt(a.usefulLife || 10, 10),
        yearsElapsed: parseInt(a.yearsElapsed || 0, 10),
        customReexpIndex: new Decimal(a.customReexpIndex || 1.0),
      })),
      inventories: [
        {
          concept: 'Bienes de Cambio',
          initialStock: new Decimal(initialStock || 0),
          finalStock: new Decimal(finalStock || 0),
        },
      ],
      bankAccounts: bankAccounts.map((b: any) => ({
        id: b.id,
        nominalInitial: new Decimal(b.nominalInitial || 0),
        nominalFinal: new Decimal(b.nominalFinal || 0),
        tcInitial: new Decimal(b.tcInitial || 1.0),
        tcFinal: new Decimal(b.tcFinal || 1.0),
        interests: new Decimal(b.interests || 0),
      })),
      cashHoldings: [],
      receivables: [],
      liabilities: [],
      withholdings: withholdings.map((w: any) => ({
        amount: new Decimal(w.amount || 0),
        taxCode: w.taxCode || 'Ganancias',
      })),
      generalDeductions: [
        {
          autonomos: new Decimal(generalDeductions?.autonomos || 0),
          servicioDomestico: new Decimal(generalDeductions?.servicioDomestico || 0),
          seguroVida: new Decimal(generalDeductions?.seguroVida || 0),
          seguroRetiro: new Decimal(generalDeductions?.seguroRetiro || 0),
          gastosSepelio: new Decimal(generalDeductions?.gastosSepelio || 0),
          interesesHipoteca: new Decimal(generalDeductions?.interesesHipoteca || 0),
          gastosEducativos: new Decimal(generalDeductions?.gastosEducativos || 0),
          alquilerCasaHabitacion: new Decimal(generalDeductions?.alquilerCasaHabitacion || 0),
          deduccionLocadorLocatario: new Decimal(generalDeductions?.deduccionLocadorLocatario || 0),
          donaciones: new Decimal(generalDeductions?.donaciones || 0),
          medicosAsistencial: new Decimal(generalDeductions?.medicosAsistencial || 0),
          honorariosMedicos: new Decimal(generalDeductions?.honorariosMedicos || 0),
        },
      ],
      personalDeductions: {
        tieneConyuge: personalDeductions?.tieneConyuge || false,
        cantidadHijos: personalDeductions?.cantidadHijos || 0,
        cantidadHijosIncapacitados: personalDeductions?.cantidadHijosIncapacitados || 0,
        tipoDeduccionEspecial: personalDeductions?.tipoDeduccionEspecial || 'Ninguna',
      },
      personalAssets: personalAssets.map((a: any) => ({
        description: a.description || '',
        type: a.type || 'Otros',
        valueInitial: new Decimal(a.valueInitial || 0),
        valueFinal: new Decimal(a.valueFinal || 0),
      })),
      personalLiabilities: personalLiabilities.map((l: any) => ({
        description: l.description || '',
        valueInitial: new Decimal(l.valueInitial || 0),
        valueFinal: new Decimal(l.valueFinal || 0),
      })),
      otherJustifications: [],
      axiStatic: {
        activoTotalInicio: new Decimal(activoTotalInicio || 0),
        bienesNoComputablesInicio: new Decimal(bienesNoComputablesInicio || 0),
        pasivoTotalInicio: new Decimal(pasivoTotalInicio || 0),
      },
      axiDynamic: axiDynamic.map((a: any) => ({
        concept: a.concept,
        type: a.type || 'Otro',
        amount: new Decimal(a.amount || 0),
        date: new Date(a.date)
      })),
      saldoAFavorAnterior: new Decimal(saldoAFavorAnterior || 0),
      quebrantosAnteriores: new Decimal(quebrantosAnteriores || 0),
    };

    const calcResult = calculateTaxReturn(calculationInput);

    // 3. Ejecutar actualización atómica bajo Prisma Transaction
    await prisma.$transaction(async (tx: any) => {
      // Eliminar datos antiguos hijos
      await tx.salesInvoice.deleteMany({ where: { taxReturnId: id } });
      await tx.purchaseInvoice.deleteMany({ where: { taxReturnId: id } });
      await tx.fixedAsset.deleteMany({ where: { taxReturnId: id } });
      await tx.inventoryValue.deleteMany({ where: { taxReturnId: id } });
      await tx.bankAccountBalance.deleteMany({ where: { taxReturnId: id } });
      await tx.taxWithholding.deleteMany({ where: { taxReturnId: id } });
      await tx.personalAsset.deleteMany({ where: { taxReturnId: id } });
      await tx.personalLiability.deleteMany({ where: { taxReturnId: id } });
      await tx.calculationRun.deleteMany({ where: { taxReturnId: id } });

      // Insertar Ventas
      if (sales.length > 0) {
        await tx.salesInvoice.createMany({
          data: sales.map((s: any) => ({
            taxReturnId: id,
            date: new Date(s.date),
            invoiceType: 'Factura',
            invoiceNumber: '00000000',
            customerName: 'Cliente General',
            netAmount: parseFloat(s.netAmount || 0),
            ivaAmount: 0,
            totalAmount: parseFloat(s.netAmount || 0),
            isExempt: s.isExempt || false,
          })),
        });
      }

      // Insertar Compras
      if (purchases.length > 0) {
        await tx.purchaseInvoice.createMany({
          data: purchases.map((p: any) => ({
            taxReturnId: id,
            date: new Date(p.date),
            invoiceType: 'Factura',
            invoiceNumber: '00000000',
            vendorName: 'Proveedor General',
            netAmount: parseFloat(p.netAmount || 0),
            ivaAmount: 0,
            totalAmount: parseFloat(p.netAmount || 0),
            isDeductible: p.isDeductible !== false,
            isExempt: p.isExempt || false,
            expenseType: p.expenseType || 'GastosGenerales',
          })),
        });
      }

      // Insertar Bienes de Uso con cálculo y persistencia de depreciaciones
      if (fixedAssets.length > 0) {
        for (const a of fixedAssets) {
          const assetInput = {
            id: a.id,
            name: a.name || '',
            type: a.type || 'Otro',
            purchaseDate: new Date(a.purchaseDate || new Date()),
            originalCost: new Decimal(a.originalCost || 0),
            usefulLife: parseInt(a.usefulLife || 10, 10),
            yearsElapsed: parseInt(a.yearsElapsed || 0, 10),
            customReexpIndex: new Decimal(a.customReexpIndex || 1.0)
          };
          const depResult = calculateFixedAssetDepreciation(assetInput);

          await tx.fixedAsset.create({
            data: {
              id: a.id || undefined,
              taxReturnId: id,
              name: a.name || '',
              type: a.type || 'Otro',
              purchaseDate: new Date(a.purchaseDate || new Date()),
              originalCost: parseFloat(a.originalCost || 0),
              usefulLife: parseInt(a.usefulLife || 10, 10),
              yearsElapsed: parseInt(a.yearsElapsed || 0, 10),
              customReexpIndex: parseFloat(a.customReexpIndex || 1.0),
              annualDepreciationHist: depResult.annualDepreciationHist.toNumber(),
              annualDepreciationAdj: depResult.annualDepreciationAdj.toNumber(),
              residualValueHist: depResult.residualValueHist.toNumber(),
              residualValueAdj: depResult.residualValueAdj.toNumber(),
            }
          });
        }
      }

      // Insertar Bienes de Cambio
      await tx.inventoryValue.create({
        data: {
          taxReturnId: id,
          concept: 'Bienes de Cambio',
          initialStock: parseFloat(initialStock || 0),
          finalStock: parseFloat(finalStock || 0),
        },
      });

      // Insertar Disponibilidades
      if (bankAccounts.length > 0) {
        await tx.bankAccountBalance.createMany({
          data: bankAccounts.map((b: any) => ({
            taxReturnId: id,
            bankName: b.name || '',
            cuitBank: b.cuitBank || '',
            accountNumber: b.accountNumber || '',
            accountType: b.accountType || 'Cuenta Corriente',
            nominalBalanceInitial: parseFloat(b.nominalInitial || 0),
            nominalBalanceFinal: parseFloat(b.nominalFinal || 0),
            tcInitial: parseFloat(b.tcInitial || 1.0),
            tcFinal: parseFloat(b.tcFinal || 1.0),
            balanceInitialArs: parseFloat(b.nominalInitial || 0) * parseFloat(b.tcInitial || 1.0),
            balanceFinalArs: parseFloat(b.nominalFinal || 0) * parseFloat(b.tcFinal || 1.0),
            interests: parseFloat(b.interests || 0),
          })),
        });
      }

      // Insertar Retenciones
      if (withholdings.length > 0) {
        await tx.taxWithholding.createMany({
          data: withholdings.map((w: any) => ({
            taxReturnId: id,
            agentName: 'Agente Retención',
            taxCode: w.taxCode || 'Ganancias',
            taxDescription: 'Impuesto a las Ganancias',
            date: new Date(),
            certificateNumber: '00000000',
            amount: parseFloat(w.amount || 0),
          })),
        });
      }

      // Insertar Activos Personales
      if (personalAssets.length > 0) {
        await tx.personalAsset.createMany({
          data: personalAssets.map((a: any) => ({
            taxReturnId: id,
            description: a.description || '',
            type: a.type || 'Otros',
            valueInitial: parseFloat(a.valueInitial || 0),
            valueFinal: parseFloat(a.valueFinal || 0),
          })),
        });
      }

      // Insertar Pasivos Personales
      if (personalLiabilities.length > 0) {
        await tx.personalLiability.createMany({
          data: personalLiabilities.map((l: any) => ({
            taxReturnId: id,
            description: l.description || '',
            valueInitial: parseFloat(l.valueInitial || 0),
            valueFinal: parseFloat(l.valueFinal || 0),
          })),
        });
      }

      // Insertar AXI Dinámico
      await tx.axiDynamicItem.deleteMany({ where: { taxReturnId: id } });
      if (axiDynamic.length > 0) {
        for (const a of axiDynamic) {
          let coef = 1.0;
          if (dbIpcIndices.length > 0) {
            const decIpc = dbIpcIndices.find((i: any) => i.monthIndex === 12);
            const movementMonth = new Date(a.date).getMonth() + 1;
            const movementIpc = dbIpcIndices.find((i: any) => i.monthIndex === movementMonth);
            if (decIpc && movementIpc) {
              coef = Number(decIpc.ipcValue) / Number(movementIpc.ipcValue);
            }
          }
          const amountNum = parseFloat(a.amount || 0);
          const factor = a.type === 'AporteCapital' ? -1 : 1;
          const computedAxi = amountNum * (coef - 1) * factor;
          
          await tx.axiDynamicItem.create({
            data: {
              taxReturnId: id,
              concept: a.concept,
              type: a.type || 'Otro',
              date: new Date(a.date),
              amount: amountNum,
              coef: coef,
              factor: factor,
              computedAxi: computedAxi
            }
          });
        }
      }

      // Guardar el Snapshot Completo de Deducciones y Pasos en el CalculationRun
      const extraStateData = {
        currentStep: currentStep || 1,
        generalDeductions,
        personalDeductions,
        activoTotalInicio,
        pasivoTotalInicio,
        bienesNoComputablesInicio,
        saldoAFavorAnterior,
        quebrantosAnteriores,
        axiDynamic,
      };

      await tx.calculationRun.create({
        data: {
          taxReturnId: id,
          resultThirdCategory: calcResult.resultadoComercialNeto.toNumber(),
          resultTotalNet: calcResult.resultadoNetoTodasCategorias.toNumber(),
          totalGeneralDeductions: calcResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber(),
          impositiveResultBeforeQuebrantos: calcResult.resultadoNetoAntesQuebrantos.toNumber(),
          quebrantosApplied: 0,
          impositiveResultNet: calcResult.resultadoImpositivoNeto.toNumber(),
          totalPersonalDeductions: calcResult.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas.toNumber(),
          taxableIncome: calcResult.gananciaNetaSujetaImpuesto.toNumber(),
          taxDetermined: calcResult.impuestoDeterminado.toNumber(),
          totalPaymentsOnAccount: calcResult.retencionesYPercepciones.toNumber(),
          finalBalance: calcResult.impuestoAPagarOARCA.toNumber(),
          computedConsumo: calcResult.consumoDiferencial.toNumber(),
          justificationDiff: 0,
          axiStaticResult: calcResult.axiStaticResult.toNumber(),
          axiDynamicResult: calcResult.axiDynamicResult.toNumber(),
          axiNetAdjustment: calcResult.resultadoAjustePorInflacion.toNumber(),
          variablesSnapshot: JSON.stringify(extraStateData),
          hasErrors: calcResult.warnings.length > 0,
          errorMessages: calcResult.warnings.join(' | '),
        },
      });

      // Actualizar cabecera principal de la Declaración
      await tx.taxReturn.update({
        where: { id },
        data: {
          status: status || existingReturn.status,
          taxParameterSetId: activeResId || null,
          updatedAt: new Date(),
        },
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
