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

export interface TaxWithholdingInput {
  amount: Decimal;
  taxCode: 'Ganancias' | 'Otros';
  cuitAgent?: string;
  agentName?: string;
  taxDescription?: string;
  regimeCode?: string;
  regimeDescription?: string;
  date?: Date;
  certificateNumber?: string;
  operationDescription?: string;
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
  
  // Determinación impositiva
  resultadoNetoTodasCategorias: Decimal;
  deduccionesGenerales: GeneralDeductionsOutput;
  resultadoNetoAntesQuebrantos: Decimal;
  resultadoImpositivoNeto: Decimal; // Después de quebrantos
  deduccionesPersonales: PersonalDeductionsOutput;
  gananciaNetaSujetaImpuesto: Decimal;
  
  // Cálculo impuesto determinado (Escala Art 94)
  impuestoDeterminado: Decimal;
  
  // Pagos a cuenta y saldo final
  retencionesYPercepciones: Decimal;
  anticiposSiguientePeriodo: Decimal[]; // Proyección de los 5 anticipos
  saldoAFavorAnterior: Decimal;
  impuestoAPagarOARCA: Decimal; // Resultado Final (Saldo a pagar si > 0, o saldo a favor si < 0)
  
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
