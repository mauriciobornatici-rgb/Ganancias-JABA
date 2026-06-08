import { Decimal } from 'decimal.js';
import {
  TaxReturnCalculationInput,
  TaxCalculationResult,
  GeneralDeductionsOutput,
  PersonalDeductionsOutput,
  Art94Bracket,
  TaxParameters
} from '../types';
import { calculateTotalDepreciation } from './amortizaciones';
import { calculateTotalAxi } from './ajustePorInflacion';
import { calculatePatrimonialJustification } from './justificacionPatrimonial';
import { calculateClosingCommercialPatrimony } from './patrimonioComercial';

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
  // Usa gte (>=) para el límite inferior para que ingresos exactamente en el límite del tramo
  // no caigan fuera de todos los tramos y produzcan impuesto = 0.
  const bracket = brackets.find(b => {
    const fromVal = new Decimal(b.fromAmount);
    const toVal = b.toAmount ? new Decimal(b.toAmount) : null;
    return taxableIncome.gte(fromVal) && (toVal === null || taxableIncome.lte(toVal));
  });

  if (!bracket) {
    // Si no coincide con ningún tramo, aplicar el primer tramo por defecto
    return new Decimal(0);
  }

  const fixed = new Decimal(bracket.fixedAmount);
  let pct = new Decimal(bracket.percentage);
  const excess = new Decimal(bracket.excessOf);

  // Validación: si el porcentaje viene como entero (e.g. 5, 9, 35) en vez de fracción (0.05, 0.09, 0.35),
  // convertirlo a fracción para evitar un impuesto 100x mayor al correcto.
  if (pct.gt(1)) {
    pct = pct.div(100);
  }

  // Fórmula: Impuesto = Importe Fijo + (Ganancia Neta - Excedente) * Alícuota
  const tax = fixed.add(taxableIncome.sub(excess).mul(pct));
  return tax.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

function calculateAxiStaticInflationRate(params: TaxParameters): Decimal | null {
  const usefulStaticCoefficient = params.usefulCoefficients?.decPreviousToDecCurrent;
  if (usefulStaticCoefficient && usefulStaticCoefficient.gt(0)) {
    return new Decimal(usefulStaticCoefficient).sub(1);
  }

  const ipcEnero = params.indicesIPC.find(i => i.monthIndex === 1);
  const ipcDiciembre = params.indicesIPC.find(i => i.monthIndex === 12);
  if (ipcEnero && ipcDiciembre) {
    const ipcEneroValue = new Decimal(ipcEnero.ipcValue);
    const ipcDiciembreValue = new Decimal(ipcDiciembre.ipcValue);
    if (ipcEneroValue.gt(0) && ipcDiciembreValue.gt(0)) {
      return ipcDiciembreValue.div(ipcEneroValue).sub(1);
    }
  }

  return null;
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
  const totalBajaLossAdj = amortizacionResult.detailedAssets
    .filter(a => a.isRetired)
    .reduce((sum, a) => sum.add(a.bajaLossAdj || 0), new Decimal(0));

  // ==========================================
  // 4. AJUSTE POR INFLACIÓN IMPOSITIVO (AXI)
  // ==========================================
  // AXI estático según planilla: coeficiente dic. anterior a dic. actual menos 1.
  const calculatedStaticInflationRate = calculateAxiStaticInflationRate(input.params);
  const staticInflationRate = calculatedStaticInflationRate ?? new Decimal(0);
  if (!calculatedStaticInflationRate) {
    warnings.push('AXI Estatico: No se encontraron indices IPC validos de enero y/o diciembre. La tasa de inflacion estatica se fijo en 0.');
  }
  const axiResult = calculateTotalAxi(
    input.axiStatic,
    input.axiDynamic,
    staticInflationRate,
    input.params.indicesIPC,
    input.params.usefulCoefficients
  );
  const resultadoAjustePorInflacion = axiResult.netAxiResult;
  // Propagar advertencias del cálculo de AXI dinámico
  warnings.push(...axiResult.warnings);

  // ==========================================
  // 5. RESULTADO NETO TERCERA CATEGORÍA
  // Resultado = Ventas - Costo - Gastos - Amortizaciones - Baja Bienes Uso + AXI
  // ==========================================
  const resultadoComercialNeto = ventasGravadas
    .sub(costoVentas)
    .sub(gastosDeducibles)
    .sub(amortizacionesBienesDeUso)
    .sub(totalBajaLossAdj)
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
  const domExcedenteJvp = Decimal.max(domReal.sub(domAdmitida), new Decimal(0));

  // Seguros de Vida
  const vidaReal = new Decimal(genInput.seguroVida);
  const vidaTope = new Decimal(caps.topeSeguroVida);
  const vidaAdmitida = vidaReal.gt(vidaTope) ? vidaTope : vidaReal;
  const vidaExcedenteJvp = Decimal.max(vidaReal.sub(vidaAdmitida), new Decimal(0));

  // Seguros de Retiro
  const retiroReal = new Decimal(genInput.seguroRetiro);
  const retiroTope = new Decimal(caps.topeSeguroRetiro);
  const retiroAdmitida = retiroReal.gt(retiroTope) ? retiroTope : retiroReal;
  const retiroExcedenteJvp = Decimal.max(retiroReal.sub(retiroAdmitida), new Decimal(0));

  // Gastos de Sepelio
  const sepelioReal = new Decimal(genInput.gastosSepelio);
  const sepelioTope = new Decimal(caps.topeGastosSepelio);
  const sepelioAdmitida = sepelioReal.gt(sepelioTope) ? sepelioTope : sepelioReal;
  const sepelioExcedenteJvp = Decimal.max(sepelioReal.sub(sepelioAdmitida), new Decimal(0));

  // Intereses de Créditos Hipotecarios
  const hipotecaReal = new Decimal(genInput.interesesHipoteca);
  const hipotecaTope = new Decimal(caps.topeInteresHipoteca);
  const hipotecaAdmitida = hipotecaReal.gt(hipotecaTope) ? hipotecaTope : hipotecaReal;
  const hipotecaExcedenteJvp = Decimal.max(hipotecaReal.sub(hipotecaAdmitida), new Decimal(0));

  // Gastos Educativos
  const educReal = new Decimal(genInput.gastosEducativos);
  const educTope = new Decimal(caps.topeGastosEducativos);
  const educAdmitida = educReal.gt(educTope) ? educTope : educReal;


  // Alquiler Casa Habitación: 40% del importe de alquiler, tope MNI
  const alquilerReal = new Decimal(genInput.alquilerCasaHabitacion).mul('0.40');
  const alquilerTope = new Decimal(input.params.deduccionesArt30.minimoNoImponible);
  const alquilerAdmitida = alquilerReal.gt(alquilerTope) ? alquilerTope : alquilerReal;
  const alquilerExcedenteJvp = Decimal.max(alquilerReal.sub(alquilerAdmitida), new Decimal(0));

  // Nueva deduccion Locador / Locatario: la planilla IG 25 computa el 10% del importe informado.
  const locadorLocatarioReal = new Decimal(genInput.deduccionLocadorLocatario || 0).mul('0.10');
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
  const prepagaTopeBase = resultadoNetoTodasCategorias.sub(deduccionesF20aF28);
  const prepagaTope = prepagaTopeBase.isNegative()
    ? new Decimal(0)
    : prepagaTopeBase.mul('0.05');
  const prepagaAdmitida = prepagaReal.gt(prepagaTope) ? prepagaTope : prepagaReal;
  const prepagaExcedenteJvp = Decimal.max(prepagaReal.sub(prepagaAdmitida), new Decimal(0));

  // Honorarios medicos: replica IG 25!D30/F30, 40% del comprobante y tope 5% luego de F20:F28.
  // Si la base neta es negativa, no se admite deducción (tope = 0).
  const honorariosMedReal = new Decimal(genInput.honorariosMedicos).mul('0.40');
  const honorariosMedTopeBase = resultadoNetoTodasCategorias.sub(deduccionesF20aF28);
  const honorariosMedTope = honorariosMedTopeBase.isNegative()
    ? new Decimal(0)
    : Decimal.min(honorariosMedTopeBase.mul('0.05'), honorariosMedReal);
  const honorariosMedAdmitida = Decimal.max(honorariosMedTope, new Decimal(0));
  const honorariosMedExcedenteJvp = Decimal.max(honorariosMedReal.sub(honorariosMedAdmitida), new Decimal(0));

  // Donaciones: replica IG 25!D31/F31, con base neta luego de F20:F23.
  const donacionesReal = new Decimal(genInput.donaciones);
  const donacionesTope = Decimal.max(resultadoNetoTodasCategorias.sub(deduccionesF20aF23).mul('0.05'), new Decimal(0));
  const donacionesAdmitida = donacionesReal.gt(donacionesTope) ? donacionesTope : donacionesReal;
  const donacionesExcedenteJvp = Decimal.max(donacionesReal.sub(donacionesAdmitida), new Decimal(0));

  // Excedente de gastos educativos (no deducible, va al JVP como erogación)
  const educExcedenteJvp = Decimal.max(educReal.sub(educAdmitida), new Decimal(0));

  const totalExcedenteDeduccionesGeneralesJvp = domExcedenteJvp
    .add(vidaExcedenteJvp)
    .add(retiroExcedenteJvp)
    .add(sepelioExcedenteJvp)
    .add(hipotecaExcedenteJvp)
    .add(educExcedenteJvp)
    .add(alquilerExcedenteJvp)
    .add(prepagaExcedenteJvp)
    .add(honorariosMedExcedenteJvp)
    .add(donacionesExcedenteJvp);

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
    autonomosAdmitidos: autonomosAdmitidos.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    servicioDomesticoTope: domAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    seguroVidaTope: vidaAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    seguroRetiroTope: retiroAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    gastosSepelioTope: sepelioAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    interesesHipotecaTope: hipotecaAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    gastosEducativosTope: educAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    medicosAsistencialTope: prepagaAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    honorariosMedicosTope: honorariosMedAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    alquilerCasaHabitacionTope: alquilerAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    locadorLocatarioTope: locadorLocatarioAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    donacionesTope: donacionesAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    totalExcedenteDeduccionesGeneralesJvp: totalExcedenteDeduccionesGeneralesJvp.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    totalDeduccionesGeneralesAdmitidas: totalDeduccionesGeneralesAdmitidas.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
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
    minimoNoImponible: mniAdmitido.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    conyuge: conyugeAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    hijos: hijosAdmitido.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    hijosIncapacitados: hijosIncapAdmitido.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    deduccionEspecial: especialAdmitida.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    totalDeduccionesPersonalesAdmitidas: totalDeduccionesPersonales.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
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

  let patrimonioComercialCierre = patrimonioComercialInicio
    .add(resultadoComercialNeto)
    .sub(totalRetiros)
    .add(totalAportes);

  const closingCommercialPatrimony = calculateClosingCommercialPatrimony(input);
  if (closingCommercialPatrimony.hasClosingCommercialData) {
    patrimonioComercialCierre = closingCommercialPatrimony.patrimonioComercialCierre;
  }

  const jvpAssets = [
    ...input.personalAssets,
    {
      description: 'Patrimonio comercial',
      type: 'Comercial',
      valueInitial: patrimonioComercialInicio,
      valueFinal: patrimonioComercialCierre,
    },
  ];

  // Integrar automáticamente el Ajuste por Inflación Impositivo (AXI) en el JVP
  const otherJustificationsWithAxi = [...input.otherJustifications];
  if (resultadoAjustePorInflacion.isNegative()) {
    otherJustificationsWithAxi.push({
      concept: 'Ajuste por inflación impositivo (pérdida)',
      column: 2,
      amount: resultadoAjustePorInflacion.abs(),
    });
  } else if (resultadoAjustePorInflacion.isPositive()) {
    otherJustificationsWithAxi.push({
      concept: 'Ajuste por inflación impositivo (ganancia)',
      column: 1,
      amount: resultadoAjustePorInflacion,
    });
  }

  const jvpResult = calculatePatrimonialJustification({
    personalAssets: jvpAssets,
    personalLiabilities: input.personalLiabilities,
    resultadoImpositivo: resultadoNetoAntesQuebrantos,
    amortizaciones: amortizacionesBienesDeUso,
    ingresosExentos: ventasExentas,
    gastosNoDeducibles: gastosNoDeducibles.add(totalExcedenteDeduccionesGeneralesJvp),
    otrasJustificaciones: otherJustificationsWithAxi,
  });
  warnings.push(...jvpResult.warnings);

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

  // Deducciones personales proyectadas (todas, incluyendo cónyuge e hijos)
  const mniAnticipo = mniAdmitido.mul(ipcAnticipoRate);
  const especialAnticipo = especialAdmitida.mul(ipcAnticipoRate);
  const conyugeAnticipo = conyugeAdmitida.mul(ipcAnticipoRate);
  const hijosAnticipo = hijosAdmitido.mul(ipcAnticipoRate);
  const hijosIncapAnticipo = hijosIncapAdmitido.mul(ipcAnticipoRate);
  const deduccionesPersonalesAnticipo = mniAnticipo
    .add(especialAnticipo)
    .add(conyugeAnticipo)
    .add(hijosAnticipo)
    .add(hijosIncapAnticipo);

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
  const cuotaAnticipo = impuestoAnticipoDeterminado.mul('0.20');
  for (let i = 0; i < 5; i++) {
    anticiposSiguientePeriodo.push(cuotaAnticipo.toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
  }

  return {
    clientName: input.clientName,
    cuit: input.cuit,
    fiscalYear: input.fiscalYear,
    ventasGravadas: ventasGravadas.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    ventasExentas: ventasExentas.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    costoVentas: costoVentas.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    gastosDeducibles: gastosDeducibles.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    gastosNoDeducibles: gastosNoDeducibles.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    amortizacionesBienesDeUso: amortizacionesBienesDeUso.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    bajaBienesDeUsoLoss: totalBajaLossAdj.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    resultadoAjustePorInflacion: resultadoAjustePorInflacion.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    axiStaticResult: axiResult.staticResult.resultadoAxiStatico.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    axiDynamicResult: axiResult.totalAxiDynamic.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    axiDynamicLines: axiResult.dynamicLines,
    resultadoComercialNeto: resultadoComercialNeto.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    resultadoNetoTodasCategorias: resultadoNetoTodasCategorias.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    deduccionesGenerales,
    resultadoNetoAntesQuebrantos: resultadoNetoAntesQuebrantos.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    resultadoImpositivoNeto: resultadoImpositivoNet.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    deduccionesPersonales,
    gananciaNetaSujetaImpuesto: gananciaNetaSujetaImpuesto.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    impuestoDeterminado: impuestoDeterminado.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    retencionesYPercepciones: retencionesYPercepciones.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    anticiposSiguientePeriodo,
    saldoAFavorAnterior: saldoAFavorAnterior.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    impuestoAPagarOARCA: impuestoAPagarOARCA.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    patrimonioInicioTotal: jvpResult.patrimonioInicio,
    patrimonioCierreTotal: jvpResult.patrimonioCierre,
    consumoDiferencial: jvpResult.consumoDiferencial,
    jvpTotalColumnaI: jvpResult.totalColumnaI,
    jvpTotalColumnaII: jvpResult.totalColumnaII,
    jvpJustificationDiff: jvpResult.justificationDiff,
    warnings,
    errors,
  };
}

