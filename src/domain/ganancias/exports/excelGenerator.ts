import * as XLSX from 'xlsx';
import { Decimal } from 'decimal.js';
import { TaxCalculationResult } from '../types';
import { buildPaymentsOnAccountBreakdown } from '../presentation/paymentsOnAccountBreakdown';

interface ExportFixedAsset {
  name?: string;
  type?: string;
  purchaseDate?: string | Date;
  originalCost?: Decimal | number | string;
  customReexpIndex?: Decimal | number | string;
  usefulLife?: number | string;
  yearsElapsed?: number | string;
}

interface ExportTaxReturnData {
  fiscalYear?: number;
  clientName?: string;
  cuit?: string;
  mainActivity?: string;
  status?: string;
  version?: number;
  fixedAssets?: ExportFixedAsset[];
}

// Helper function to safely convert Decimal to number or fallback to 0
function toNumber(val: unknown): number {
  if (val instanceof Decimal) return val.toNumber();
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function downloadTaxReturnExcel(
  data?: ExportTaxReturnData,
  calculationResult?: Partial<TaxCalculationResult> | null
) {
  if (typeof window === 'undefined') return;

  const wb = XLSX.utils.book_new();

  // Mismos importes que el papel de trabajo en pantalla: el desglose de pagos a cuenta y los
  // quebrantos aplicados salen del motor, para que la planilla exportada cierre igual.
  const pagosACuenta = buildPaymentsOnAccountBreakdown(
    calculationResult ? (calculationResult as TaxCalculationResult) : null,
  );
  const quebrantosAplicados = Math.max(
    0,
    Math.max(0, toNumber(calculationResult?.resultadoNetoAntesQuebrantos))
      - toNumber(calculationResult?.resultadoImpositivoNeto),
  );

  // ==========================================
  // SHEET 1: DETERMINACIÓN GENERAL
  // ==========================================
  const generalData = [
    ['ESTUDIO IMPOSITIVO CONTABLE JABA', ''],
    ['PAPEL DE TRABAJO - DETERMINACIÓN ANUAL DEL IMPUESTO A LAS GANANCIAS', ''],
    ['PERÍODO FISCAL:', data?.fiscalYear || 2025],
    ['', ''],
    ['DATOS GENERALES', ''],
    ['Contribuyente:', data?.clientName || ''],
    ['CUIT Impositivo:', data?.cuit || ''],
    ['Actividad Principal:', data?.mainActivity || ''],
    ['Estado DDJJ:', data?.status || 'Borrador'],
    ['Versión:', `v${data?.version || 0}`],
    ['', ''],
    ['1. RENTAS DE LA TERCERA CATEGORÍA (COMERCIALES)', ''],
    ['Facturación Anual Gravada (Ventas)', toNumber(calculationResult?.ventasGravadas)],
    ['Facturación Exenta / Monotributo', toNumber(calculationResult?.ventasExentas)],
    ['(-) Costo de Mercaderías Vendidas (CMV)', -Math.abs(toNumber(calculationResult?.costoVentas))],
    ['(-) Gastos de Estructura / Comerciales', -Math.abs(toNumber(calculationResult?.gastosDeducibles))],
    ['(-) Amortizaciones de Bienes de Uso', -Math.abs(toNumber(calculationResult?.amortizacionesBienesDeUso))],
    ['(+/-) Ajuste por Inflación Impositivo (AXI)', toNumber(calculationResult?.resultadoAjustePorInflacion)],
    ['RESULTADO NETO COMERCIAL', toNumber(calculationResult?.resultadoComercialNeto)],
    // Punto 3 (2026-07-24): el resultado atribuido de sociedades suma al neto de la categoría.
    ['(+/-) Resultado Atribuido por Participación en Sociedades', toNumber(calculationResult?.resultadoParticipacionSociedades)],
    ['RESULTADO NETO DE TODAS LAS CATEGORÍAS', toNumber(calculationResult?.resultadoNetoTodasCategorias)],
    ['', ''],
    ['2. DEDUCCIONES COMPUTADAS (ART. 30 Y GENERALES)', ''],
    ['Mínimo No Imponible (MNI)', -Math.abs(toNumber(calculationResult?.deduccionesPersonales?.minimoNoImponible))],
    ['Deducción Especial (Art. 30 Inc. C, con doceava parte)', -Math.abs(
      toNumber(calculationResult?.deduccionesPersonales?.deduccionEspecial || 0) +
      toNumber(calculationResult?.deduccionesPersonales?.deduccionEspecialDoceavaParte || 0)
    )],
    ['Cargas de Familia (Cónyuge/Hijos)', -Math.abs(
      toNumber(calculationResult?.deduccionesPersonales?.conyuge || 0) +
      toNumber(calculationResult?.deduccionesPersonales?.hijos || 0) +
      toNumber(calculationResult?.deduccionesPersonales?.hijosIncapacitados || 0)
    )],
    ['Deducciones Generales Admitidas', -Math.abs(toNumber(calculationResult?.deduccionesGenerales?.totalDeduccionesGeneralesAdmitidas))],
    // Totales tomados del motor (no recalculados a mano): si no, el papel exportado no cierra.
    ['TOTAL EROGACIONES Y DEDUCCIONES COMPUTADAS', -Math.abs(
      toNumber(calculationResult?.deduccionesPersonales?.totalDeduccionesPersonalesAdmitidas || 0) +
      toNumber(calculationResult?.deduccionesGenerales?.totalDeduccionesGeneralesAdmitidas || 0)
    )],
    ['(-) Quebrantos de Ejercicios Anteriores Aplicados', -Math.abs(quebrantosAplicados)],
    ['', ''],
    ['3. DETERMINACIÓN DEL IMPUESTO Y SALDO FINAL', ''],
    ['BASE IMPONIBLE (Ganancia Neta Sujeta a Impuesto)', toNumber(calculationResult?.gananciaNetaSujetaImpuesto)],
    ['Impuesto Determinado AFIP (Artículo 94)', toNumber(calculationResult?.impuestoDeterminado)],
    ['(-) Retenciones y Percepciones Computables', -Math.abs(toNumber(calculationResult?.retencionesYPercepciones))],
    // Pagos a cuenta del IG 25 F62:F66 (impuesto al cheque, anticipos, combustibles).
    ...pagosACuenta.map(item => [`(-) ${item.label} (${item.reference})`, -Math.abs(toNumber(item.amount))] as (string | number)[]),
    ['(-) Saldo a Favor del Período Anterior', -Math.abs(toNumber(calculationResult?.saldoAFavorAnterior))],
    ['SALDO DETERMINADO A PAGAR / (A FAVOR)', toNumber(calculationResult?.impuestoAPagarOARCA)],
    ['Impuesto al cheque trasladable no computado (F70)', toNumber(calculationResult?.saldoTrasladableIdcb)],
    ['', ''],
    ['4. PROYECCIÓN DE ANTICIPOS (EJERCICIO SIGUIENTE)', '']
  ];

  // Agregar los 5 anticipos a la planilla
  const anticipos = calculationResult?.anticiposSiguientePeriodo || [];
  anticipos.forEach((ant, idx: number) => {
    generalData.push([`Anticipo ${idx + 1} (20%)`, toNumber(ant)]);
  });

  const wsGeneral = XLSX.utils.aoa_to_sheet(generalData);
  XLSX.utils.book_append_sheet(wb, wsGeneral, 'Determinacion General');

  // ==========================================
  // SHEET 2: BIENES DE USO (AMORTIZACIÓN)
  // ==========================================
  const fixedAssetsHeaders = [
    ['JABA - INVENTARIO Y PLAN DE AMORTIZACIÓN DE BIENES DE USO', ''],
    ['', ''],
    [
      'Nombre del Bien', 
      'Tipo de Activo', 
      'Fecha Adquisición', 
      'Costo Origen Histórico', 
      'Vida Útil (Años)', 
      'Años al Cierre', 
      'Índice Reexpresión',
      'Amortización Histórica Anual',
      'Amortización Impositiva Reexpresada Anual',
      'Valor Residual Histórico',
      'Valor Residual Reexpresado'
    ]
  ];

  const fixedAssetsRows = (data?.fixedAssets || []).map((a) => {
    const cost = toNumber(a.originalCost);
    const reexp = toNumber(a.customReexpIndex || 1.0);
    const reexpCost = cost * reexp;
    const life = parseInt(String(a.usefulLife || 10), 10);
    const elapsed = Math.max(0, parseInt(String(a.yearsElapsed || 0), 10));
    const beyondUsefulLife = elapsed > life;
    const depreciatedYearsAtClose = Math.min(Math.max(elapsed, 1), life);
    
    const depHist = beyondUsefulLife ? 0 : cost / life;
    const depAdj = beyondUsefulLife ? 0 : reexpCost / life;
    
    const resHist = beyondUsefulLife ? 0 : cost - (depHist * depreciatedYearsAtClose);
    const resAdj = beyondUsefulLife ? 0 : reexpCost - (depAdj * depreciatedYearsAtClose);

    return [
      a.name || 'Activo sin Nombre',
      a.type || 'Otro',
      a.purchaseDate ? new Date(a.purchaseDate).toLocaleDateString('es-AR') : '',
      cost,
      life,
      elapsed,
      reexp,
      depHist,
      depAdj,
      resHist,
      resAdj
    ];
  });

  const wsAssets = XLSX.utils.aoa_to_sheet([...fixedAssetsHeaders, ...fixedAssetsRows]);
  XLSX.utils.book_append_sheet(wb, wsAssets, 'Bienes de Uso');

  // ==========================================
  // SHEET 3: JUSTIFICACIÓN PATRIMONIAL (JVP)
  // ==========================================
  const jvpHeaders = [
    ['JABA - CONCILIACIÓN DE VARIACIÓN PATRIMONIAL (ART. 84 LEY GANANCIAS)', ''],
    ['PERÍODO FISCAL:', data?.fiscalYear || 2025],
    ['', ''],
    ['COLUMNA I - DESTINOS Y PATRIMONIO CIERRE', 'IMPORTE I', 'COLUMNA II - ORÍGENES Y PATRIMONIO INICIO', 'IMPORTE II']
  ];

  const resultadoImpositivoVal = toNumber(calculationResult?.resultadoImpositivoNeto);
  const patrimonioInicioVal = toNumber(calculationResult?.patrimonioInicioTotal);
  const patrimonioCierreVal = toNumber(calculationResult?.patrimonioCierreTotal);
  const gastosNoDeduciblesVal = toNumber(calculationResult?.gastosNoDeducibles);
  const excedenteDeduccionesGeneralesJvpVal = toNumber(calculationResult?.deduccionesGenerales?.totalExcedenteDeduccionesGeneralesJvp);
  const amortizacionesBienesDeUsoVal = toNumber(calculationResult?.amortizacionesBienesDeUso);
  const ingresosExentosVal = toNumber(calculationResult?.ventasExentas);
  const consumoVal = toNumber(calculationResult?.consumoDiferencial);
  const totalColumnaIVal = toNumber(calculationResult?.jvpTotalColumnaI)
    || patrimonioCierreVal + gastosNoDeduciblesVal + (resultadoImpositivoVal < 0 ? Math.abs(resultadoImpositivoVal) : 0) + consumoVal;
  const totalColumnaIIVal = toNumber(calculationResult?.jvpTotalColumnaII)
    || patrimonioInicioVal + (resultadoImpositivoVal > 0 ? resultadoImpositivoVal : 0) + ingresosExentosVal + amortizacionesBienesDeUsoVal;
  const jvpDiffVal = toNumber(calculationResult?.jvpJustificationDiff);

  const jvpRows = [
    [
      'Patrimonio Neto al Cierre', 
      patrimonioCierreVal, 
      'Patrimonio Neto al Inicio', 
      patrimonioInicioVal
    ],
    [
      'Gastos Comerciales No Deducibles', 
      gastosNoDeduciblesVal, 
      resultadoImpositivoVal > 0 ? 'Resultado Impositivo Ganancia (Tercera Cat.)' : '',
      resultadoImpositivoVal > 0 ? resultadoImpositivoVal : 0
    ],
    [
      'Excedente deducciones generales no admitido',
      excedenteDeduccionesGeneralesJvpVal,
      '',
      0
    ],
    [
      resultadoImpositivoVal < 0 ? 'Resultado Impositivo Quebranto' : '', 
      resultadoImpositivoVal < 0 ? Math.abs(resultadoImpositivoVal) : 0, 
      'Ingresos Exentos / Monotributo', 
      ingresosExentosVal
    ],
    [
      '', 
      0, 
      'Amortizaciones que no implican erogación', 
      amortizacionesBienesDeUsoVal
    ],
    [
      'CONSUMO ANUAL (Diferencial Col II - Col I)', 
      consumoVal, 
      '', 
      0
    ],
    [
      'TOTAL COLUMNA I', 
      totalColumnaIVal,
      'TOTAL COLUMNA II', 
      totalColumnaIIVal
    ],
    [
      'CUADRE JVP',
      jvpDiffVal,
      '',
      0
    ]
  ];

  const wsJvp = XLSX.utils.aoa_to_sheet([...jvpHeaders, ...jvpRows]);
  XLSX.utils.book_append_sheet(wb, wsJvp, 'Justificacion Patrimonial');

  // ==========================================
  // DESCARGA AUTOMÁTICA DEL LIBRO
  // ==========================================
  const sanitizedClientName = (data?.clientName || 'Contribuyente')
    .replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Papel_de_Trabajo_${sanitizedClientName}_${data?.fiscalYear || 2025}.xlsx`;
  
  XLSX.writeFile(wb, filename);
}
