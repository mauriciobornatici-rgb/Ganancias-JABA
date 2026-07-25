import { Decimal } from 'decimal.js';

// ==========================================
// 1. ESTRUCTURAS DE PARÁMETROS NORMATIVOS
// ==========================================

export interface TaxDeductionsArt30 {
  minimoNoImponible: Decimal;
  conyuge: Decimal;
  hijo: Decimal;
  hijoIncapacitado: Decimal;
  especialAutonomo: Decimal;
  especialEmprendedor: Decimal;
  especialDependiente: Decimal;
}

export interface TaxGeneralDeductionsCaps {
  topeServicioDomestico: Decimal;
  topeSeguroVida: Decimal;
  topeSeguroRetiro: Decimal;
  topeGastosSepelio: Decimal;
  topeInteresHipoteca: Decimal;
  topeGastosEducativos: Decimal;
}

export interface Art94Bracket {
  fromAmount: Decimal;
  toAmount: Decimal | null; // null represents "and above"
  fixedAmount: Decimal;
  percentage: Decimal;       // e.g., 0.05 to 0.35
  excessOf: Decimal;
}

export interface UpdateIndexValue {
  monthIndex: number; // 1 to 12
  ipcValue: Decimal;
}

export interface UsefulTaxCoefficients {
  decPreviousToDecCurrent?: Decimal;
  currentYearAverage?: Decimal;
}

export interface TaxParameters {
  year: number;
  deduccionesArt30: TaxDeductionsArt30;
  topesDeduccionesGenerales: TaxGeneralDeductionsCaps;
  escalaArt94: Art94Bracket[];
  indicesIPC: UpdateIndexValue[];
  usefulCoefficients?: UsefulTaxCoefficients;
  /**
   * Deduccion especifica de jubilados (8 haberes minimos anuales acumulados, Art. 30 inc. c).
   * Si no se informa, el motor usa el fallback hardcodeado por anio fiscal y emite warning.
   */
  deduccionEspecificaJubilados?: Decimal;
}

// ==========================================
// 2. ENTRADAS NORMALIZADAS DEL CONTRIBUYENTE
// ==========================================

export interface SalesInput {
  date: Date;
  netAmount: Decimal;
  isExempt: boolean; // Ingresos Exentos (Monotributo / Exenciones impositivas)
  invoiceType?: string;
  invoiceNumber?: string;
  customerName?: string;
  counterpartyCuit?: string;
  ivaAmount?: Decimal;
  totalAmount?: Decimal;
}

export interface PurchaseInput {
  date: Date;
  netAmount: Decimal;
  isDeductible: boolean;
  isExempt: boolean; // Egresos no gravados / exentos
  expenseType?: string; // e.g., 'MateriaPrima', 'GastosGenerales'
  invoiceType?: string;
  invoiceNumber?: string;
  vendorName?: string;
  counterpartyCuit?: string;
  ivaAmount?: Decimal;
  totalAmount?: Decimal;
}

export interface FixedAssetInput {
  id: string;
  name: string;
  type: 'Rodado' | 'Inmueble' | 'Equipamiento' | 'Otro';
  purchaseDate: Date;
  originalCost: Decimal;
  usefulLife: number;     // Vida útil total en años
  yearsElapsed: number;   // Años amortizados al cierre, como fiscalYear - año de compra + 1
  customReexpIndex?: Decimal; // Coeficiente IPC correspondiente manual si no se calcula dinámico
  isRetired?: boolean;    // Indica si el bien de uso fue dado de baja/enajenado en el ejercicio
}

export interface InventoryInput {
  concept: string;
  initialStock: Decimal;
  finalStock: Decimal;
}

export interface BankAccountInput {
  id: string;
  nominalInitial: Decimal;
  nominalFinal: Decimal;
  tcInitial: Decimal;
  tcFinal: Decimal;
  interests: Decimal;
}

export interface CashInput {
  currency: string; // ARS, USD
  nominalInitial: Decimal;
  nominalFinal: Decimal;
  tcFinal: Decimal;
}

export interface ReceivableInput {
  description: string;
  type: 'Comercial' | 'Fiscal' | 'Financiero';
  balanceInitial: Decimal;
  balanceFinal: Decimal;
}

export interface PayableInput {
  description: string;
  type: 'Proveedores' | 'Otros';
  balanceInitial: Decimal;
  balanceFinal: Decimal;
}

/**
 * Codigos de credito computable contra el impuesto determinado (IG 25 F61:F67):
 * - 'Ganancias': retenciones y percepciones de Ganancias (F67).
 * - 'AnticipoEfectivo': anticipos cancelados en efectivo (F63).
 * - 'AnticipoIDCB': anticipos cancelados con impuesto sobre creditos y debitos (F62).
 * - 'AnticipoMisFacilidades': anticipos cancelados con plan Mis Facilidades (F64).
 * - 'IDCB': computo directo del impuesto sobre creditos y debitos bancarios (F65).
 * - 'Combustibles': impuesto sobre combustibles liquidos (F66).
 * - 'Otros': retenciones de otros impuestos (IVA, IIBB...); NO computa contra Ganancias.
 */
export type TaxCreditCode =
  | 'Ganancias'
  | 'AnticipoEfectivo'
  | 'AnticipoIDCB'
  | 'AnticipoMisFacilidades'
  | 'IDCB'
  | 'Combustibles'
  | 'Otros';

export interface TaxWithholdingInput {
  amount: Decimal;
  taxCode: TaxCreditCode;
  cuitAgent?: string;
  agentName?: string;
  taxDescription?: string;
  regimeCode?: string;
  regimeDescription?: string;
  date?: Date;
  certificateNumber?: string;
  operationDescription?: string;
}

/**
 * Participación en sociedades, explotaciones unipersonales y fideicomisos (excepto art. 73).
 * Criterio del usuario (2026-07-24): se cargan el porcentaje y el resultado total de la sociedad,
 * la app calcula el atribuido y `attributedResultOverride` permite corregirlo a mano con aviso de
 * la diferencia (verificación cruzada).
 */
export interface SocietyParticipationInput {
  cuit: string;
  denomination: string;
  societyType?: string;
  /** Porcentaje de participación (0 a 100, no fracción). */
  participationPercent: Decimal;
  /** Resultado impositivo total de la sociedad del ejercicio (puede ser negativo). */
  societyResult: Decimal;
  /** Resultado atribuido cargado a mano. undefined/null = usar el calculado. */
  attributedResultOverride?: Decimal | null;
  /** Justificación profesional obligatoria cuando el importe manual difiere del calculado. */
  overrideReason?: string | null;
}

export interface PersonalAssetInput {
  description: string;
  type: string;
  valueInitial: Decimal;
  valueFinal: Decimal;
}

export interface PersonalLiabilityInput {
  description: string;
  valueInitial: Decimal;
  valueFinal: Decimal;
}

export interface GeneralDeductionsInput {
  autonomos: Decimal;
  servicioDomestico: Decimal;
  seguroVida: Decimal;
  seguroRetiro: Decimal;
  gastosSepelio: Decimal;
  interesesHipoteca: Decimal;
  gastosEducativos: Decimal;
  alquilerCasaHabitacion: Decimal;
  deduccionLocadorLocatario?: Decimal;
  donaciones: Decimal;
  medicosAsistencial: Decimal; // Prepagas
  honorariosMedicos: Decimal;
}

export interface PersonalDeductionsInput {
  tieneConyuge: boolean;
  cantidadHijos: number;
  cantidadHijosIncapacitados: number;
  tipoDeduccionEspecial: 'Autonomo' | 'Emprendedor' | 'Dependiente' | 'Ninguna';
  esJubiladoOchoHaberes?: boolean; // Caso especial jubilados
}

export interface AxiStaticInput {
  activoTotalInicio: Decimal;
  bienesNoComputablesInicio: Decimal; // Incluye anticipos/saldos a favor del año anterior (como F24)
  pasivoTotalInicio: Decimal;
}

export interface AxiDynamicInput {
  concept: string;
  type: 'RetiroSocio' | 'AporteCapital' | 'Dividendo' | 'Otro';
  amount: Decimal;
  date: Date;
}

// Consolidado total de entrada impositiva para la liquidación
export interface TaxReturnCalculationInput {
  clientName: string;
  cuit: string;
  fiscalYear: number;
  
  // Parámetros normativos aplicados
  params: TaxParameters;
  
  // Datos cuantitativos de carga
  sales: SalesInput[];
  purchases: PurchaseInput[];
  fixedAssets: FixedAssetInput[];
  inventories: InventoryInput[];
  bankAccounts: BankAccountInput[];
  cashHoldings: CashInput[];
  receivables: ReceivableInput[];
  liabilities: PayableInput[];
  withholdings: TaxWithholdingInput[];
  /** Participación en sociedades: su resultado atribuido suma al neto de tercera categoría. */
  societyParticipations?: SocietyParticipationInput[];

  // Deducciones generales y de familia
  generalDeductions: GeneralDeductionsInput[];
  personalDeductions: PersonalDeductionsInput;
  
  // Justificación Patrimonial (JVP)
  personalAssets: PersonalAssetInput[];
  personalLiabilities: PersonalLiabilityInput[];
  otherJustifications: { concept: string; column: number; amount: Decimal }[];
  
  // Ajuste por Inflación (AXI)
  axiStatic: AxiStaticInput;
  axiDynamic: AxiDynamicInput[];

  // Saldos de ejercicios anteriores
  saldoAFavorAnterior?: Decimal;   // Saldo a favor impositivo del período anterior
  quebrantosAnteriores?: Decimal;  // Quebrantos de períodos anteriores a compensar
}

// ==========================================
// 3. ESTRUCTURAS DE SALIDA DEL MOTOR
// ==========================================

export interface FixedAssetCalculationOutput {
  id: string;
  name: string;
  annualDepreciationHist: Decimal;
  annualDepreciationAdj: Decimal;
  residualValueHist: Decimal;
  residualValueAdj: Decimal;
  isRetired?: boolean;
  bajaLossHist?: Decimal; // Valor residual al inicio del año impositivo (pérdida por baja histórica)
  bajaLossAdj?: Decimal;  // Valor residual al inicio del año impositivo reexpresado (pérdida por baja reexpresada)
}

export interface AxiStaticResult {
  activoComputableInicio: Decimal;
  pasivoComputableInicio: Decimal;
  capitalComputableInicio: Decimal;
  factorActualizacion: Decimal;
  resultadoAxiStatico: Decimal; // Positivo (ganancia) o Negativo (pérdida)
}

export interface AxiDynamicLineResult {
  concept: string;
  amount: Decimal;
  factorActualizacion: Decimal;
  computedAxi: Decimal;
}

export interface AxiResult {
  staticResult: AxiStaticResult;
  dynamicLines: AxiDynamicLineResult[];
  totalAxiDynamic: Decimal;
  netAxiResult: Decimal; // Impacto neto impositivo (Resultado del ejercicio)
}

export interface GeneralDeductionsOutput {
  autonomosAdmitidos: Decimal;
  servicioDomesticoTope: Decimal;
  seguroVidaTope: Decimal;
  seguroRetiroTope: Decimal;
  gastosSepelioTope: Decimal;
  interesesHipotecaTope: Decimal;
  gastosEducativosTope: Decimal;
  medicosAsistencialTope: Decimal;
  honorariosMedicosTope: Decimal;
  alquilerCasaHabitacionTope: Decimal;
  locadorLocatarioTope: Decimal;
  donacionesTope: Decimal;
  totalExcedenteDeduccionesGeneralesJvp: Decimal;
  totalDeduccionesGeneralesAdmitidas: Decimal;
}

export interface PersonalDeductionsOutput {
  minimoNoImponible: Decimal;
  conyuge: Decimal;
  hijos: Decimal;
  hijosIncapacitados: Decimal;
  deduccionEspecial: Decimal;
  /** Doceava parte adicional para dependientes/jubilados (IG 25 F50): (F41+F42+F43+F44+F49)/12 */
  deduccionEspecialDoceavaParte: Decimal;
  totalDeduccionesPersonalesAdmitidas: Decimal;
}

export interface TaxCalculationResult {
  clientName: string;
  cuit: string;
  fiscalYear: number;
  
  // Estado de resultados comercial
  ventasGravadas: Decimal;
  ventasExentas: Decimal;
  costoVentas: Decimal;
  gastosDeducibles: Decimal;
  gastosNoDeducibles: Decimal;
  amortizacionesBienesDeUso: Decimal;
  resultadoAjustePorInflacion: Decimal;
  axiStaticResult: Decimal;
  axiDynamicResult: Decimal;
  resultadoComercialNeto: Decimal; // Neto Tercera Categoría impositivo
  bajaBienesDeUsoLoss?: Decimal;
  axiDynamicLines?: AxiDynamicLineResult[];
  /** Resultado atribuido por participación en sociedades (suma al neto de todas las categorías). */
  resultadoParticipacionSociedades: Decimal;
  
  // Determinación impositiva
  resultadoNetoTodasCategorias: Decimal;
  deduccionesGenerales: GeneralDeductionsOutput;
  resultadoNetoAntesQuebrantos: Decimal;
  resultadoImpositivoNeto: Decimal; // Después de quebrantos
  deduccionesPersonales: PersonalDeductionsOutput;
  gananciaNetaSujetaImpuesto: Decimal;
  
  // Cálculo impuesto determinado (Escala Art 94)
  impuestoDeterminado: Decimal;
  
  // Pagos a cuenta y saldo final (IG 25 F61:F67, F68 y F70)
  retencionesYPercepciones: Decimal;        // F67: solo taxCode 'Ganancias'
  anticiposCanceladosIdcb: Decimal;         // F62
  anticiposCanceladosEfectivo: Decimal;     // F63
  anticiposCanceladosMisFacilidades: Decimal; // F64
  computoIdcb: Decimal;                     // F65
  computoCombustibles: Decimal;             // F66
  saldoTrasladableIdcb: Decimal;            // F70: IDCB que excede el impuesto, no es saldo de libre disponibilidad
  anticiposSiguientePeriodo: Decimal[];     // Proyección de los 5 anticipos (RG 5211)
  impuestoProyectadoAnticipos: Decimal;     // Anticipos!E20
  saldoAFavorAnterior: Decimal;
  impuestoAPagarOARCA: Decimal; // Resultado Final (Saldo a pagar si > 0, o saldo a favor si < 0)
  quebrantoTrasladable: Decimal; // Quebranto del ejercicio (F38 negativo) trasladable a ejercicios futuros
  
  // Justificación Patrimonial (JVP)
  patrimonioInicioTotal: Decimal;
  patrimonioCierreTotal: Decimal;
  consumoDiferencial: Decimal; // El "Consumo" final obtenido
  jvpTotalColumnaI: Decimal;
  jvpTotalColumnaII: Decimal;
  jvpJustificationDiff: Decimal;
  
  // Alertas e inconsistencias
  warnings: string[];
  errors: string[];
}
