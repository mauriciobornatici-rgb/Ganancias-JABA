import { Decimal } from 'decimal.js';
import {
  TaxReturnCalculationInput,
  TaxCalculationResult,
  GeneralDeductionsOutput,
  PersonalDeductionsOutput,
  Art94Bracket
} from '../types';
import { calculateTotalDepreciation } from './amortizaciones';
import { calculateTotalAxi } from './ajustePorInflacion';

/**
 * Aplica la escala progresiva del Artículo 94 para determinar el impuesto correspondiente.
 */
export function calculateArt94Tax(
  taxableIncome: Decimal,
  brackets: Art94Bracket[]
): Decimal {
  if (taxableIncome.isNegative() || taxableIncome.isZero()) {
    return new Decimal(0);
  }

  // Buscar el tramo correspondiente en la escala
  const bracket = brackets.find(b => {
    const fromVal = new Decimal(b.fromAmount);
    const toVal = b.toAmount ? new Decimal(b.toAmount) : null;
    return taxableIncome.gt(fromVal) && (toVal === null || taxableIncome.lte(toVal));
  });

  if (!bracket) {
    // Si no coincide con ningún tramo, aplicar el primer tramo por defecto
    return new Decimal(0);
  }

  const fixed = new Decimal(bracket.fixedAmount);
  const pct = new Decimal(bracket.percentage);
  const excess = new Decimal(bracket.excessOf);

  // Fórmula: Impuesto = Importe Fijo + (Ganancia Neta - Excedente) * Alícuota
  const tax = fixed.add(taxableIncome.sub(excess).mul(pct));
  return tax.round();
}

/**
 * Realiza la liquidación consolidada impositiva y la auditoría contable.
 */
export function calculateTaxReturn(
  input: TaxReturnCalculationInput
): TaxCalculationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // ==========================================
  // 1. CONSOLIDACIÓN DE VENTAS E INGRESOS
  // ==========================================
  let ventasGravadas = new Decimal(0);
  let ventasExentas = new Decimal(0);
  
  input.sales.forEach(s => {
    const amount = new Decimal(s.netAmount);
    if (s.isExempt) {
      ventasExentas = ventasExentas.add(amount);
    } else {
      ventasGravadas = ventasGravadas.add(amount);
    }
  });

  // ==========================================
  // 2. CONSOLIDACIÓN DE COMPRAS Y GASTOS COMERCIALES
  // ==========================================
  let costoVentas = new Decimal(0);
  let gastosDeducibles = new Decimal(0);
  let gastosNoDeducibles = new Decimal(0);

  // Bienes de Cambio: Costo de Ventas = Existencia Inicial + Compras - Existencia Final
  let stockInicialTotal = new Decimal(0);
  let stockFinalTotal = new Decimal(0);
  input.inventories.forEach(inv => {
    stockInicialTotal = stockInicialTotal.add(inv.initialStock);
    stockFinalTotal = stockFinalTotal.add(inv.finalStock);
  });
  
  let totalComprasMateriaPrima = new Decimal(0);
  input.purchases.forEach(p => {
    const amount = new Decimal(p.netAmount);
    if (p.isDeductible) {
      if (p.expenseType === 'MateriaPrima' || p.expenseType === 'Mercaderia') {
        totalComprasMateriaPrima = totalComprasMateriaPrima.add(amount);
      } else {
        gastosDeducibles = gastosDeducibles.add(amount);
      }
    } else {
      gastosNoDeducibles = gastosNoDeducibles.add(amount);
    }
  });

  costoVentas = stockInicialTotal.add(totalComprasMateriaPrima).sub(stockFinalTotal);
  if (costoVentas.isNegative()) {
    costoVentas = new Decimal(0);
    warnings.push("Advertencia Contable: El costo de ventas calculado es negativo debido a sobrevaluación de existencias finales.");
  }

  // ==========================================
  // 3. AMORTIZACIÓN DE BIENES DE USO
  // ==========================================
  const amortizacionResult = calculateTotalDepreciation(input.fixedAssets);
  const amortizacionesBienesDeUso = amortizacionResult.totalDepreciationAdj; // Valor reexpresado impositivo

  // ==========================================
  // 4. AJUSTE POR INFLACIÓN IMPOSITIVO (AXI)
  // ==========================================
  // Coeficiente anual de inflación para el AXI Estático: (IPC_diciembre / IPC_enero) - 1
  let staticInflationRate = new Decimal(0);
  const ipcEnero = input.params.indicesIPC.find(i => i.monthIndex === 1);
  const ipcDiciembre = input.params.indicesIPC.find(i => i.monthIndex === 12);
  if (ipcEnero && ipcDiciembre) {
    staticInflationRate = new Decimal(ipcDiciembre.ipcValue).div(new Decimal(ipcEnero.ipcValue)).sub(1);
  } else {
    warnings.push('AXI Estático: No se encontraron índices IPC de enero y/o diciembre. La tasa de inflación estática se fijó en 0.');
  }
  const axiResult = calculateTotalAxi(input.axiStatic, input.axiDynamic, staticInflationRate, input.params.indicesIPC);
  const resultadoAjustePorInflacion = axiResult.netAxiResult;
  // Propagar advertencias del cálculo de AXI dinámico
  warnings.push(...axiResult.warnings);

  // ==========================================
  // 5. RESULTADO NETO TERCERA CATEGORÍA
  // Resultado = Ventas - Costo - Gastos - Amortizaciones + AXI
  // ==========================================
  const resultadoComercialNeto = ventasGravadas
    .sub(costoVentas)
    .sub(gastosDeducibles)
    .sub(amortizacionesBienesDeUso)
    .add(resultadoAjustePorInflacion);

  // Consolida categorías impositivas (en este MVP de 3ra Cat es equivalente)
  const resultadoNetoTodasCategorias = resultadoComercialNeto;

  // ==========================================
  // 6. DEDUCCIONES GENERALES (CON TOPES LEGALES)
  // ==========================================
  const caps = input.params.topesDeduccionesGenerales;
  const genInput = input.generalDeductions[0] || {
    autonomos: new Decimal(0),
    servicioDomestico: new Decimal(0),
    seguroVida: new Decimal(0),
    seguroRetiro: new Decimal(0),
    gastosSepelio: new Decimal(0),
    interesesHipoteca: new Decimal(0),
    gastosEducativos: new Decimal(0),
    alquilerCasaHabitacion: new Decimal(0),
    deduccionLocadorLocatario: new Decimal(0),
    donaciones: new Decimal(0),
    medicosAsistencial: new Decimal(0),
    honorariosMedicos: new Decimal(0),
  };

  // Servicio Doméstico
  const autonomosAdmitidos = new Decimal(genInput.autonomos);
  const domReal = new Decimal(genInput.servicioDomestico);
  const domTope = new Decimal(caps.topeServicioDomestico);
  const domAdmitida = domReal.gt(domTope) ? domTope : domReal;

  // Seguros de Vida
  const vidaReal = new Decimal(genInput.seguroVida);
  const vidaTope = new Decimal(caps.topeSeguroVida);
  const vidaAdmitida = vidaReal.gt(vidaTope) ? vidaTope : vidaReal;

  // Seguros de Retiro
  const retiroReal = new Decimal(genInput.seguroRetiro);
  const retiroTope = new Decimal(caps.topeSeguroRetiro);
  const retiroAdmitida = retiroReal.gt(retiroTope) ? retiroTope : retiroReal;

  // Gastos de Sepelio
  const sepelioReal = new Decimal(genInput.gastosSepelio);
  const sepelioTope = new Decimal(caps.topeGastosSepelio);
  const sepelioAdmitida = sepelioReal.gt(sepelioTope) ? sepelioTope : sepelioReal;

  // Intereses de Créditos Hipotecarios
  const hipotecaReal = new Decimal(genInput.interesesHipoteca);
  const hipotecaTope = new Decimal(caps.topeInteresHipoteca);
  const hipotecaAdmitida = hipotecaReal.gt(hipotecaTope) ? hipotecaTope : hipotecaReal;

  // Gastos Educativos
  const educReal = new Decimal(genInput.gastosEducativos);
  const educTope = new Decimal(caps.topeGastosEducativos);
  const educAdmitida = educReal.gt(educTope) ? educTope : educReal;


  // Alquiler Casa Habitación: 40% del importe de alquiler, tope MNI
  const alquilerReal = new Decimal(genInput.alquilerCasaHabitacion).mul(0.40);
  const alquilerTope = new Decimal(input.params.deduccionesArt30.minimoNoImponible);
  const alquilerAdmitida = alquilerReal.gt(alquilerTope) ? alquilerTope : alquilerReal;

  // Nueva deduccion Locador / Locatario: la planilla IG 25 computa el 10% del importe informado.
  const locadorLocatarioReal = new Decimal(genInput.deduccionLocadorLocatario || 0).mul(0.10);
  const locadorLocatarioAdmitida = Decimal.max(locadorLocatarioReal, new Decimal(0));

  const deduccionesF20aF23 = new Decimal(genInput.autonomos)
    .add(domAdmitida)
    .add(vidaAdmitida)
    .add(retiroAdmitida);
  const deduccionesF20aF28 = deduccionesF20aF23
    .add(sepelioAdmitida)
    .add(hipotecaAdmitida)
    .add(educAdmitida)
    .add(alquilerAdmitida)
    .add(locadorLocatarioAdmitida);

  // Prepagas: replica IG 25!D29/F29 con el chequeo del 5% luego de F20:F28.
  const prepagaReal = new Decimal(genInput.medicosAsistencial);
  const prepagaTopeControl = resultadoNetoTodasCategorias.sub(deduccionesF20aF28).mul(0.05);
  const prepagaTope = prepagaTopeControl.isNegative()
    ? new Decimal(0)
    : resultadoNetoTodasCategorias.sub(deduccionesF20aF23).mul(0.05);
  const prepagaAdmitida = prepagaReal.gt(prepagaTope) ? prepagaTope : prepagaReal;

  // Honorarios medicos: replica IG 25!D30/F30, 40% del comprobante y tope 5% luego de F20:F28.
  const honorariosMedReal = new Decimal(genInput.honorariosMedicos).mul(0.40);
  const honorariosMedTopeControl = resultadoNetoTodasCategorias.sub(deduccionesF20aF28).mul(0.05);
  const honorariosMedTope = honorariosMedTopeControl.isNegative()
    ? honorariosMedReal
    : Decimal.min(honorariosMedTopeControl, honorariosMedReal);
  const honorariosMedAdmitida = Decimal.max(honorariosMedTope, new Decimal(0));

  // Donaciones: replica IG 25!D31/F31, con base neta luego de F20:F23.
  const donacionesReal = new Decimal(genInput.donaciones);
  const donacionesTope = Decimal.max(resultadoNetoTodasCategorias.sub(deduccionesF20aF23).mul(0.05), new Decimal(0));
  const donacionesAdmitida = donacionesReal.gt(donacionesTope) ? donacionesTope : donacionesReal;

  const totalDeduccionesGeneralesAdmitidas = new Decimal(genInput.autonomos)
    .add(prepagaAdmitida)
    .add(domAdmitida)
    .add(vidaAdmitida)
    .add(retiroAdmitida)
    .add(sepelioAdmitida)
    .add(hipotecaAdmitida)
    .add(educAdmitida)
    .add(donacionesAdmitida)
    .add(alquilerAdmitida)
    .add(locadorLocatarioAdmitida)
    .add(honorariosMedAdmitida);

  const deduccionesGenerales: GeneralDeductionsOutput = {
    autonomosAdmitidos: autonomosAdmitidos.round(),
    servicioDomesticoTope: domAdmitida.round(),
    seguroVidaTope: vidaAdmitida.round(),
    seguroRetiroTope: retiroAdmitida.round(),
    gastosSepelioTope: sepelioAdmitida.round(),
    interesesHipotecaTope: hipotecaAdmitida.round(),
    gastosEducativosTope: educAdmitida.round(),
    medicosAsistencialTope: prepagaAdmitida.round(),
    honorariosMedicosTope: honorariosMedAdmitida.round(),
    alquilerCasaHabitacionTope: alquilerAdmitida.round(),
    locadorLocatarioTope: locadorLocatarioAdmitida.round(),
    donacionesTope: donacionesAdmitida.round(),
    totalDeduccionesGeneralesAdmitidas: totalDeduccionesGeneralesAdmitidas.round(),
  };

  // Ganancia Neta antes de Deducciones Personales
  const resultadoNetoAntesQuebrantos = resultadoNetoTodasCategorias.sub(totalDeduccionesGeneralesAdmitidas);
  const quebrantosAnteriores = new Decimal(input.quebrantosAnteriores || 0);
  const resultadoImpositivoNet = Decimal.max(resultadoNetoAntesQuebrantos.sub(quebrantosAnteriores), new Decimal(0));

  // ==========================================
  // 7. DEDUCCIONES PERSONALES (ARTÍCULO 30)
  // ==========================================
  const art30 = input.params.deduccionesArt30;
  const pInput = input.personalDeductions;

  // Caso especial jubilados: la deducción específica de 8 haberes mínimos reemplaza al MNI y a la Deducción Especial.
  let mniAdmitido = new Decimal(art30.minimoNoImponible);
  let especialAdmitida = new Decimal(0);

  if (pInput.esJubiladoOchoHaberes) {
    const year = input.fiscalYear;
    if (year === 2024) {
      mniAdmitido = new Decimal(15660344); // 8 haberes mínimos 2024 acumulados
    } else if (year === 2026) {
      mniAdmitido = new Decimal(36000000); // Proyección 8 haberes mínimos 2026
    } else {
      mniAdmitido = new Decimal(24800000); // 8 haberes mínimos 2025 acumulados
    }
  } else {
    // Deducción Especial común
    if (pInput.tipoDeduccionEspecial === 'Autonomo') {
      especialAdmitida = new Decimal(art30.especialAutonomo);
    } else if (pInput.tipoDeduccionEspecial === 'Emprendedor') {
      especialAdmitida = new Decimal(art30.especialEmprendedor);
    } else if (pInput.tipoDeduccionEspecial === 'Dependiente') {
      especialAdmitida = new Decimal(art30.especialDependiente);
    }
  }

  const conyugeAdmitida = pInput.tieneConyuge ? new Decimal(art30.conyuge) : new Decimal(0);
  const hijosAdmitido = new Decimal(art30.hijo).mul(pInput.cantidadHijos);
  const hijosIncapAdmitido = new Decimal(art30.hijoIncapacitado).mul(pInput.cantidadHijosIncapacitados);

  const totalDeduccionesPersonales = mniAdmitido
    .add(conyugeAdmitida)
    .add(hijosAdmitido)
    .add(hijosIncapAdmitido)
    .add(especialAdmitida);

  const deduccionesPersonales: PersonalDeductionsOutput = {
    minimoNoImponible: mniAdmitido.round(),
    conyuge: conyugeAdmitida.round(),
    hijos: hijosAdmitido.round(),
    hijosIncapacitados: hijosIncapAdmitido.round(),
    deduccionEspecial: especialAdmitida.round(),
    totalDeduccionesPersonalesAdmitidas: totalDeduccionesPersonales.round(),
  };

  // ==========================================
  // 8. GANANCIA NETA SUJETA A IMPUESTO
  // ==========================================
  let gananciaNetaSujetaImpuesto = resultadoImpositivoNet.sub(totalDeduccionesPersonales);
  if (gananciaNetaSujetaImpuesto.isNegative()) {
    gananciaNetaSujetaImpuesto = new Decimal(0);
  }

  // ==========================================
  // 9. IMPUESTO DETERMINADO (ARTÍCULO 94 SCALES)
  // ==========================================
  const impuestoDeterminado = calculateArt94Tax(gananciaNetaSujetaImpuesto, input.params.escalaArt94);

  // ==========================================
  // 10. PAGOS A CUENTA Y SALDO FINAL
  // ==========================================
  let retencionesYPercepciones = new Decimal(0);
  input.withholdings.forEach(w => {
    retencionesYPercepciones = retencionesYPercepciones.add(w.amount);
  });

  // Saldo a favor impositivo anterior o de libre disponibilidad
  const saldoAFavorAnterior = new Decimal(input.saldoAFavorAnterior || 0);

  // Impuesto a pagar o saldo a favor
  const impuestoAPagarOARCA = impuestoDeterminado
    .sub(retencionesYPercepciones)
    .sub(saldoAFavorAnterior);

  // ==========================================
  // 11. JUSTIFICACIÓN PATRIMONIAL (JVP INTEGRADA)
  // ==========================================
  let personalAssetsInitialTotal = new Decimal(0);
  let personalAssetsFinalTotal = new Decimal(0);
  input.personalAssets.forEach(a => {
    personalAssetsInitialTotal = personalAssetsInitialTotal.add(a.valueInitial);
    personalAssetsFinalTotal = personalAssetsFinalTotal.add(a.valueFinal);
  });

  let bankAccountsInitialTotal = new Decimal(0);
  let bankAccountsFinalTotal = new Decimal(0);
  input.bankAccounts.forEach(b => {
    bankAccountsInitialTotal = bankAccountsInitialTotal.add(b.nominalInitial.mul(b.tcInitial ?? 1));
    bankAccountsFinalTotal = bankAccountsFinalTotal.add(b.nominalFinal.mul(b.tcFinal ?? 1));
  });

  let personalLiabilitiesInitialTotal = new Decimal(0);
  let personalLiabilitiesFinalTotal = new Decimal(0);
  input.personalLiabilities.forEach(l => {
    personalLiabilitiesInitialTotal = personalLiabilitiesInitialTotal.add(l.valueInitial);
    personalLiabilitiesFinalTotal = personalLiabilitiesFinalTotal.add(l.valueFinal);
  });

  const patrimonioComercialInicio = new Decimal(input.axiStatic.activoTotalInicio || 0)
    .sub(input.axiStatic.pasivoTotalInicio || 0);

  let totalRetiros = new Decimal(0);
  let totalAportes = new Decimal(0);
  (input.axiDynamic || []).forEach(a => {
    if (a.type === 'RetiroSocio') {
      totalRetiros = totalRetiros.add(a.amount || 0);
    } else if (a.type === 'AporteCapital') {
      totalAportes = totalAportes.add(a.amount || 0);
    }
  });

  const patrimonioComercialCierre = patrimonioComercialInicio
    .add(resultadoComercialNeto)
    .sub(totalRetiros)
    .add(totalAportes);

  const patrimonioInicioTotal = personalAssetsInitialTotal
    .add(bankAccountsInitialTotal)
    .sub(personalLiabilitiesInitialTotal)
    .add(patrimonioComercialInicio);
  const patrimonioCierreTotal = personalAssetsFinalTotal
    .add(bankAccountsFinalTotal)
    .sub(personalLiabilitiesFinalTotal)
    .add(patrimonioComercialCierre);

  // JVP Column Balance
  let colII = patrimonioInicioTotal.add(resultadoComercialNeto.isPositive() ? resultadoComercialNeto : 0)
    .add(ventasExentas)
    .add(amortizacionesBienesDeUso);
  
  let colI = patrimonioCierreTotal.add(gastosNoDeducibles)
    .add(resultadoComercialNeto.isNegative() ? resultadoComercialNeto.abs() : 0);

  input.otherJustifications.forEach(j => {
    if (j.column === 1) {
      colI = colI.add(j.amount);
    } else {
      colII = colII.add(j.amount);
    }
  });

  // Consumo por diferencia
  const consumoDiferencial = colII.sub(colI);
  if (consumoDiferencial.isNegative()) {
    warnings.push(`Inconsistencia impositiva (JVP): El consumo anual calculado es negativo ($${consumoDiferencial.toFixed(2)}). El contribuyente posee variaciones patrimoniales no justificadas.`);
  }

  // ==========================================
  // 12. PROYECCIÓN DE ANTICIPOS EJERCICIO SIGUIENTE
  // Recalculo con factor de reexpresión IPC (e.g. 1.142939)
  // ==========================================
  // Factor de proyección IPC para anticipos: usar variación interanual de los índices cargados
  let ipcAnticipoRate = new Decimal(1);
  if (input.params.indicesIPC.length >= 2) {
    const ipcDic = input.params.indicesIPC.find(i => i.monthIndex === 12);
    const ipcEne = input.params.indicesIPC.find(i => i.monthIndex === 1);
    if (ipcDic && ipcEne) {
      ipcAnticipoRate = new Decimal(ipcDic.ipcValue).div(new Decimal(ipcEne.ipcValue));
    }
  }
  const baseImponibleAnticipo = resultadoImpositivoNet.mul(ipcAnticipoRate);

  // Mínimos actualizados
  const mniAnticipo = mniAdmitido.mul(ipcAnticipoRate);
  const especialAnticipo = especialAdmitida.mul(ipcAnticipoRate);
  const deduccionesPersonalesAnticipo = mniAnticipo.add(especialAnticipo);

  let gananciaAnticipo = baseImponibleAnticipo.sub(deduccionesPersonalesAnticipo);
  if (gananciaAnticipo.isNegative()) {
    gananciaAnticipo = new Decimal(0);
  }

  // Recalcular la escala para el año siguiente aplicando el factor de inflación a los tramos
  const escalaActualizada: Art94Bracket[] = input.params.escalaArt94.map(b => ({
    fromAmount: new Decimal(b.fromAmount).mul(ipcAnticipoRate),
    toAmount: b.toAmount ? new Decimal(b.toAmount).mul(ipcAnticipoRate) : null,
    fixedAmount: new Decimal(b.fixedAmount).mul(ipcAnticipoRate),
    percentage: new Decimal(b.percentage),
    excessOf: new Decimal(b.excessOf).mul(ipcAnticipoRate)
  }));

  const impuestoAnticipoDeterminado = calculateArt94Tax(gananciaAnticipo, escalaActualizada);
  
  // Anticipos proyectados: 5 cuotas del 20% del impuesto proyectado
  const anticiposSiguientePeriodo: Decimal[] = [];
  const cuotaAnticipo = impuestoAnticipoDeterminado.mul(0.20);
  for (let i = 0; i < 5; i++) {
    anticiposSiguientePeriodo.push(cuotaAnticipo.round());
  }

  return {
    clientName: input.clientName,
    cuit: input.cuit,
    fiscalYear: input.fiscalYear,
    ventasGravadas: ventasGravadas.round(),
    ventasExentas: ventasExentas.round(),
    costoVentas: costoVentas.round(),
    gastosDeducibles: gastosDeducibles.round(),
    gastosNoDeducibles: gastosNoDeducibles.round(),
    amortizacionesBienesDeUso: amortizacionesBienesDeUso.round(),
    resultadoAjustePorInflacion: resultadoAjustePorInflacion.round(),
    axiStaticResult: axiResult.staticResult.resultadoAxiStatico.round(),
    axiDynamicResult: axiResult.totalAxiDynamic.round(),
    resultadoComercialNeto: resultadoComercialNeto.round(),
    resultadoNetoTodasCategorias: resultadoNetoTodasCategorias.round(),
    deduccionesGenerales,
    resultadoNetoAntesQuebrantos: resultadoNetoAntesQuebrantos.round(),
    resultadoImpositivoNeto: resultadoImpositivoNet.round(),
    deduccionesPersonales,
    gananciaNetaSujetaImpuesto: gananciaNetaSujetaImpuesto.round(),
    impuestoDeterminado: impuestoDeterminado.round(),
    retencionesYPercepciones: retencionesYPercepciones.round(),
    anticiposSiguientePeriodo,
    saldoAFavorAnterior: saldoAFavorAnterior.round(),
    impuestoAPagarOARCA: impuestoAPagarOARCA.round(),
    patrimonioInicioTotal: patrimonioInicioTotal.round(),
    patrimonioCierreTotal: patrimonioCierreTotal.round(),
    consumoDiferencial: consumoDiferencial.round(),
    warnings,
    errors,
  };
}

