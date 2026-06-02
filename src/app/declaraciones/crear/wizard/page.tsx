'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Upload, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  FileSpreadsheet, 
  DollarSign
} from 'lucide-react';
import Link from 'next/link';
import { Decimal } from 'decimal.js';
import { calculateTaxReturn } from '@/domain/ganancias/calculations/determinacionImpuesto';
import { calculateYearsElapsedAtClose } from '@/domain/ganancias/calculations/amortizaciones';
import { buildTaxReturnCalculationInput } from '@/domain/ganancias/mappers/calculationInputMapper';
import { buildGeneralDeductionsBreakdown } from '@/domain/ganancias/presentation/deductionsBreakdown';
import { buildTaxParameterClosureWarning } from '@/domain/ganancias/presentation/taxParameterNotice';
import { buildInvoiceTraceSummary } from '@/domain/ganancias/presentation/invoiceTrace';
import { formatCurrencyCents, formatCurrencyWhole as formatDecimal } from '@/domain/ganancias/presentation/moneyFormat';
import {
  buildDefaultWizardCashHolding,
  buildDefaultWizardLiability,
  buildDefaultWizardOtherJustification,
  buildDefaultWizardReceivable,
  buildWizardOtherJustificationFromPreset,
  coerceWizardOtherJustificationColumn,
  coerceWizardPersonalDeductionType,
  resolveWizardRouteReturnId,
  shouldRequestActiveTaxParameters,
  shouldResetWizardDetailsOnIdentityChange,
  WIZARD_OTHER_JUSTIFICATION_PRESETS,
  wizardMoneyToNumber,
  wizardMoneyToString,
  type ActiveTaxParameters,
  type TaxResolutionOption,
  type WizardAxiDynamic,
  type WizardBankAccount,
  type WizardCashHolding,
  type WizardCellValue,
  type WizardClient,
  type WizardFixedAsset,
  type WizardLiability,
  type WizardOtherJustification,
  type WizardOtherJustificationPresetKey,
  type WizardPersonalAsset,
  type WizardPersonalDeductionType,
  type WizardPersonalLiability,
  type WizardPreviousReturnData,
  type WizardPurchase,
  type WizardReceivable,
  type WizardSale,
  type WizardTaxReturnSummary,
  type WizardWithholding,
} from '@/domain/ganancias/presentation/wizardStateTypes';
import {
  buildTaxReturnCloseConsistencyWarning,
  buildTaxReturnPreviewStatus,
  buildTaxReturnPreviewRequest,
  hydrateTaxReturnPreviewResult,
} from '@/domain/ganancias/presentation/taxReturnPreview';
import {
  buildDuplicateTaxReturnRedirectPath,
  buildTaxReturnSaveRequest,
  resolveTaxReturnSaveTarget,
} from '@/domain/ganancias/presentation/taxReturnSaveFlow';
import { mockTaxReturns, mockClients } from '@/domain/ganancias/mockData';

// Escala Art 94 Mock (2025)
const escala2025BracketMock = [
  { fromAmount: new Decimal(0), toAmount: new Decimal(1749901.45), fixedAmount: new Decimal(0), percentage: new Decimal(0.05), excessOf: new Decimal(0) },
  { fromAmount: new Decimal(1749901.45), toAmount: new Decimal(3499802.89), fixedAmount: new Decimal(87495.07), percentage: new Decimal(0.09), excessOf: new Decimal(1749901.45) },
  { fromAmount: new Decimal(3499802.89), toAmount: new Decimal(5249704.34), fixedAmount: new Decimal(244986.20), percentage: new Decimal(0.12), excessOf: new Decimal(3499802.89) },
  { fromAmount: new Decimal(5249704.34), toAmount: new Decimal(7874556.52), fixedAmount: new Decimal(454974.38), percentage: new Decimal(0.15), excessOf: new Decimal(5249704.34) },
  { fromAmount: new Decimal(7874556.52), toAmount: new Decimal(15749113.04), fixedAmount: new Decimal(848702.20), percentage: new Decimal(0.19), excessOf: new Decimal(7874556.52) },
  { fromAmount: new Decimal(15749113.04), toAmount: new Decimal(23623669.56), fixedAmount: new Decimal(2344867.94), percentage: new Decimal(0.23), excessOf: new Decimal(15749113.04) },
  { fromAmount: new Decimal(23623669.56), toAmount: new Decimal(35435504.34), fixedAmount: new Decimal(4156015.94), percentage: new Decimal(0.27), excessOf: new Decimal(23623669.56) },
  { fromAmount: new Decimal(35435504.34), toAmount: new Decimal(53153256.52), fixedAmount: new Decimal(7345211.33), percentage: new Decimal(0.31), excessOf: new Decimal(35435504.34) },
  { fromAmount: new Decimal(53153256.52), toAmount: null, fixedAmount: new Decimal(12837714.51), percentage: new Decimal(0.35), excessOf: new Decimal(53153256.52) },
];

function validateCuit(cuit: string): boolean {
  const cleanCuit = cuit.replace(/\D/g, '');
  if (cleanCuit.length !== 11) return false;
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCuit[i], 10) * factors[i];
  }
  const verifier = parseInt(cleanCuit[10], 10);
  const calculated = 11 - (sum % 11);
  if (calculated === 11) {
    return verifier === 0;
  } else if (calculated === 10) {
    return verifier === 9 || verifier === 4;
  } else {
    return verifier === calculated;
  }
}

function formatCuit(cuit: string): string {
  const clean = cuit.replace(/\D/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 10) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10, 11)}`;
}

type ImportedDate = string | number | Date;

type ImportedInvoiceRow = {
  date: ImportedDate;
  netAmount: string | number;
  isExempt?: boolean;
  invoiceType?: string;
  invoiceNumber?: string;
  counterpartyCuit?: string;
  ivaAmount?: string | number;
  totalAmount?: string | number;
};

type ImportedSaleRow = ImportedInvoiceRow & {
  customerName?: string;
};

type ImportedPurchaseRow = ImportedInvoiceRow & {
  isDeductible?: boolean;
  expenseType?: string;
  vendorName?: string;
};

type ImportedWithholdingRow = {
  amount: string | number;
  taxCode: string;
};

type ImportResponse = {
  success: boolean;
  error?: string;
  data?: {
    sales?: ImportedSaleRow[];
    purchases?: ImportedPurchaseRow[];
    withholdings?: ImportedWithholdingRow[];
  };
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function WizardPage() {
  const params = useParams();
  const id = params?.id as string;
  const routeReturnId = resolveWizardRouteReturnId(id);
  const [persistedReturnId, setPersistedReturnId] = useState('');
  const activeReturnId = persistedReturnId || routeReturnId;
  const initialCuitRef = React.useRef<string | null>(null);
  const isCreatingRef = React.useRef(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [maxVisitedStep, setMaxVisitedStep] = useState(1);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadedRouteReturnId, setLoadedRouteReturnId] = useState('');
  const [isHistoryImportLoading, setIsHistoryImportLoading] = useState(false);
  const isLoadingData = isHistoryImportLoading || (routeReturnId !== '' && loadedRouteReturnId !== routeReturnId);

  const updateCurrentStep = React.useCallback((nextStep: number) => {
    const boundedStep = Math.max(1, Math.min(6, nextStep));
    setCurrentStep(boundedStep);
    setMaxVisitedStep(prev => Math.max(prev, boundedStep));
  }, []);

  // ==========================================
  // DATOS DE ESTADO DE LA DECLARACIÓN (WIZARD STATE)
  // ==========================================
  const [cuit, setCuit] = useState('');
  const [clientName, setClientName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(2025);
  const [taxParameterSetId, setTaxParameterSetId] = useState<string>('');
  const [resolutions, setResolutions] = useState<TaxResolutionOption[]>([]);
  const [activeParamsState, setActiveParamsState] = useState<{
    taxParameterSetId: string;
    params: ActiveTaxParameters | null;
  }>({ taxParameterSetId: '', params: null });
  const activeParams = activeParamsState.taxParameterSetId === taxParameterSetId ? activeParamsState.params : null;
  const [backendPreview, setBackendPreview] = useState<{
    key: string;
    result: ReturnType<typeof calculateTaxReturn>;
  } | null>(null);
  const [isBackendPreviewPending, setIsBackendPreviewPending] = useState(false);
  const [backendPreviewError, setBackendPreviewError] = useState<string | null>(null);

  // Saldos Iniciales y Patrimonio del Año Anterior
  const [activoTotalInicio, setActivoTotalInicio] = useState('0');
  const [pasivoTotalInicio, setPasivoTotalInicio] = useState('0');
  const [bienesNoComputablesInicio, setBienesNoComputablesInicio] = useState('0');
  const [saldoAFavorAnterior, setSaldoAFavorAnterior] = useState('0');
  const [quebrantosAnteriores, setQuebrantosAnteriores] = useState('0');
  const [axiDynamic, setAxiDynamic] = useState<WizardAxiDynamic[]>([]);

  // Control de Modales de Persistencia y Cierre
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalActionType, setModalActionType] = useState<'borrador' | 'cerrar' | null>(null);
  const [modalLoading, setModalLoading] = useState(true);
  
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [isLiveBarOpen, setIsLiveBarOpen] = useState(true);
  const [showAllDeductions, setShowAllDeductions] = useState(false);
  
  // Searchable contribuyente dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [dbClients, setDbClients] = useState<WizardClient[]>([]);
  const [dbDeclaraciones, setDbDeclaraciones] = useState<WizardTaxReturnSummary[]>([]);

  const checkIfStepHasData = (step: number): boolean => {
    if (step === 1) {
      return (
        clientName.trim() !== '' && 
        cuit.trim() !== '' && 
        (
          personalDeductions.tieneConyuge ||
          personalDeductions.cantidadHijos > 0 ||
          personalDeductions.cantidadHijosIncapacitados > 0 ||
          personalDeductions.tipoDeduccionEspecial !== 'Ninguna' ||
          personalDeductions.esJubiladoOchoHaberes ||
          activoTotalInicio !== '0' ||
          pasivoTotalInicio !== '0'
        )
      );
    }
    if (step === 2) return sales.length > 0;
    if (step === 3) return purchases.length > 0 || (initialStock !== '0' && initialStock !== '') || (finalStock !== '0' && finalStock !== '');
    if (step === 4) {
      return fixedAssets.length > 0 ||
        bankAccounts.length > 0 ||
        cashHoldings.length > 0 ||
        receivables.length > 0 ||
        liabilities.length > 0 ||
        personalAssets.length > 0 ||
        personalLiabilities.length > 0 ||
        otherJustifications.length > 0;
    }
    if (step === 5) return Object.values(generalDeductions).some(val => val !== '0' && val !== '') || withholdings.length > 0 || axiDynamic.length > 0;
    if (step === 6) return true;
    return false;
  };

  const saveToServer = (targetStep: number) => {
    const saveTarget = resolveTaxReturnSaveTarget({ routeId: id, persistedReturnId });
    if (saveTarget.isCreate) return;
    
    const payload = {
      cuit,
      clientName,
      fiscalYear,
      currentStep: targetStep,
      taxParameterSetId,
      sales,
      purchases,
      fixedAssets,
      initialStock,
      finalStock,
      bankAccounts,
      cashHoldings,
      receivables,
      liabilities,
      withholdings,
      generalDeductions,
      personalDeductions,
      personalAssets,
      personalLiabilities,
      otherJustifications,
      activoTotalInicio,
      pasivoTotalInicio,
      bienesNoComputablesInicio,
      saldoAFavorAnterior,
      quebrantosAnteriores,
      axiDynamic,
      status: 'Borrador'
    };
    
    fetch(saveTarget.url, {
      method: saveTarget.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
      if (!res.success) {
        console.error("Error al auto-guardar DDJJ en el servidor:", res.error);
      }
    })
    .catch(err => {
      console.error("Error de red al auto-guardar en el servidor:", err);
    });
  };

  const changeStep = (newStep: number) => {
    // Si intentamos avanzar desde el paso 1 sin un cliente registrado
    if (newStep > 1) {
      if (!validateCuit(cuit)) {
        setStep1Error('El CUIT ingresado posee un formato o dígito verificador inválido. Por favor, ingrese un CUIT válido (formato XX-XXXXXXXX-X).');
        updateCurrentStep(1);
        return;
      }
      const isRegisteredClient = dbClients.some(c => c.cuit === cuit);
      if (!isRegisteredClient) {
        setStep1Error('El contribuyente ingresado no se encuentra registrado en el padrón de Clientes. Para proceder, debe seleccionar un contribuyente existente o registrarlo previamente en la sección de Clientes.');
        updateCurrentStep(1);
        return;
      }
    }
    setStep1Error(null);
    updateCurrentStep(newStep);
    saveToServer(newStep);
  };

  const handleSaveAction = (type: 'borrador' | 'cerrar') => {
    if (type === 'cerrar') {
      const previewWarning = buildTaxReturnCloseConsistencyWarning(previewStatus);
      if (previewWarning && !window.confirm(`${previewWarning}\n\n¿Desea continuar y cerrar igualmente?`)) {
        return;
      }

      const warning = buildTaxParameterClosureWarning({ taxParameterSetId }, activeParams);
      if (warning && !window.confirm(`${warning}\n\n¿Desea continuar y cerrar igualmente?`)) {
        return;
      }
    }

    setShowSaveModal(true);
    setModalActionType(type);
    setModalLoading(true);
    
    const targetStatus = type === 'borrador' ? 'Borrador' : 'Cerrada';
    
    const payload = {
      cuit,
      clientName,
      fiscalYear,
      currentStep,
      taxParameterSetId,
      sales,
      purchases,
      fixedAssets,
      initialStock,
      finalStock,
      bankAccounts,
      cashHoldings,
      receivables,
      liabilities,
      withholdings,
      generalDeductions,
      personalDeductions,
      personalAssets,
      personalLiabilities,
      otherJustifications,
      activoTotalInicio,
      pasivoTotalInicio,
      bienesNoComputablesInicio,
      saldoAFavorAnterior,
      quebrantosAnteriores,
      axiDynamic,
      status: targetStatus
    };

    const saveRequest = buildTaxReturnSaveRequest({ routeId: id, persistedReturnId, payload });

    fetch(saveRequest.url, saveRequest.init)
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        if (saveRequest.target.isCreate && res.data?.id) {
          const newId = res.data.id;
          setPersistedReturnId(newId);
          localStorage.setItem(`jaba_wizard_state_${newId}`, JSON.stringify(payload));
          window.history.replaceState(null, '', `/declaraciones/${newId}/wizard`);
        }
        setModalLoading(false);
      } else {
        const duplicateRedirectPath = buildDuplicateTaxReturnRedirectPath(res);
        if (duplicateRedirectPath) {
          alert(`${res.error}\n\nSe abrirá la declaración existente para continuar la carga.`);
          window.location.href = duplicateRedirectPath;
          return;
        }

        alert(`Error al guardar en base de datos: ${res.error}`);
        setShowSaveModal(false);
      }
    })
    .catch(err => {
      console.error("Error de conexión al guardar:", err);
      alert(`Error de red al intentar guardar: ${err.message}`);
      setShowSaveModal(false);
    });
  };
  
  const [sales, setSales] = useState<WizardSale[]>([]);

  const [purchases, setPurchases] = useState<WizardPurchase[]>([]);

  const [fixedAssets, setFixedAssets] = useState<WizardFixedAsset[]>([]);

  const [initialStock, setInitialStock] = useState('0');
  const [finalStock, setFinalStock] = useState('0');

  const [bankAccounts, setBankAccounts] = useState<WizardBankAccount[]>([]);

  const [cashHoldings, setCashHoldings] = useState<WizardCashHolding[]>([]);

  const [receivables, setReceivables] = useState<WizardReceivable[]>([]);

  const [liabilities, setLiabilities] = useState<WizardLiability[]>([]);

  const [withholdings, setWithholdings] = useState<WizardWithholding[]>([]);

  const [generalDeductions, setGeneralDeductions] = useState({
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
  });

  const [personalDeductions, setPersonalDeductions] = useState<{
    tieneConyuge: boolean;
    cantidadHijos: number;
    cantidadHijosIncapacitados: number;
    tipoDeduccionEspecial: WizardPersonalDeductionType;
    esJubiladoOchoHaberes: boolean;
  }>({
    tieneConyuge: false,
    cantidadHijos: 0,
    cantidadHijosIncapacitados: 0,
    tipoDeduccionEspecial: 'Ninguna',
    esJubiladoOchoHaberes: false,
  });

  const [personalAssets, setPersonalAssets] = useState<WizardPersonalAsset[]>([]);

  const [personalLiabilities, setPersonalLiabilities] = useState<WizardPersonalLiability[]>([]);

  const [otherJustifications, setOtherJustifications] = useState<WizardOtherJustification[]>([]);

  const resetWizardDetailState = React.useCallback(() => {
    setActivoTotalInicio('0');
    setPasivoTotalInicio('0');
    setBienesNoComputablesInicio('0');
    setInitialStock('0');
    setFinalStock('0');
    setSales([]);
    setPurchases([]);
    setFixedAssets([]);
    setBankAccounts([]);
    setCashHoldings([]);
    setReceivables([]);
    setLiabilities([]);
    setWithholdings([]);
    setGeneralDeductions({
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
    });
    setPersonalDeductions({
      tieneConyuge: false,
      cantidadHijos: 0,
      cantidadHijosIncapacitados: 0,
      tipoDeduccionEspecial: 'Ninguna',
      esJubiladoOchoHaberes: false,
    });
    setPersonalAssets([]);
    setPersonalLiabilities([]);
    setOtherJustifications([]);
    setAxiDynamic([]);
  }, []);

  const resetWizardDetailsAfterIdentityChange = React.useCallback(() => {
    if (typeof window === 'undefined') return;

    const hasSavedState = Boolean(localStorage.getItem(`jaba_wizard_state_${activeReturnId || id}`));
    if (shouldResetWizardDetailsOnIdentityChange({ activeReturnId, hasSavedState })) {
      resetWizardDetailState();
    }
  }, [activeReturnId, id, resetWizardDetailState]);

  const loadFromLocalStorage = React.useCallback(() => {
    if (!routeReturnId) {
      setCuit('');
      setClientName('');
      setFiscalYear(2025);
      setTaxParameterSetId('');
      resetWizardDetailState();
      updateCurrentStep(1);
      return;
    }

    const saved = localStorage.getItem(`jaba_wizard_state_${routeReturnId}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.cuit) {
          setCuit(data.cuit);
          initialCuitRef.current = data.cuit;
        }
        if (data.clientName) setClientName(data.clientName);
        if (data.fiscalYear) setFiscalYear(data.fiscalYear);
        if (data.taxParameterSetId) setTaxParameterSetId(data.taxParameterSetId);
        if (data.currentStep) updateCurrentStep(Math.min(6, data.currentStep));
        if (data.sales) setSales(data.sales);
        if (data.purchases) setPurchases(data.purchases);
        if (data.fixedAssets) setFixedAssets(data.fixedAssets);
        if (data.initialStock) setInitialStock(data.initialStock);
        if (data.finalStock) setFinalStock(data.finalStock);
        if (data.bankAccounts) setBankAccounts(data.bankAccounts);
        if (data.cashHoldings) setCashHoldings(data.cashHoldings);
        if (data.receivables) setReceivables(data.receivables);
        if (data.liabilities) setLiabilities(data.liabilities);
        if (data.withholdings) setWithholdings(data.withholdings);
        if (data.generalDeductions) setGeneralDeductions(data.generalDeductions);
        if (data.personalDeductions) setPersonalDeductions(data.personalDeductions);
        if (data.personalAssets) setPersonalAssets(data.personalAssets);
        if (data.personalLiabilities) setPersonalLiabilities(data.personalLiabilities);
        if (data.otherJustifications) setOtherJustifications(data.otherJustifications);
        if (data.activoTotalInicio) setActivoTotalInicio(data.activoTotalInicio);
        if (data.pasivoTotalInicio) setPasivoTotalInicio(data.pasivoTotalInicio);
        if (data.bienesNoComputablesInicio) setBienesNoComputablesInicio(data.bienesNoComputablesInicio);
        if (data.saldoAFavorAnterior) setSaldoAFavorAnterior(data.saldoAFavorAnterior);
        if (data.quebrantosAnteriores) setQuebrantosAnteriores(data.quebrantosAnteriores);
        if (data.axiDynamic) setAxiDynamic(data.axiDynamic);
        return;
      } catch (e) {
        console.error("Failed parsing wizard state from localStorage", e);
      }
    }

    // Fallback a carga estatica por defecto si es return-2 (Maria Luz Gomez) sin cache anterior
    if (routeReturnId === 'return-2') {
      setCuit('27-95430211-3');
      initialCuitRef.current = '27-95430211-3';
      setClientName('Maria Luz Gomez');
      setFiscalYear(2025);
      setSales([
        { date: '2025-04-12', netAmount: '12400000', isExempt: false },
        { date: '2025-07-20', netAmount: '150000', isExempt: true }
      ]);
      setPurchases([
        { date: '2025-03-14', netAmount: '8000000', isDeductible: true, isExempt: false, expenseType: 'MateriaPrima' },
        { date: '2025-06-18', netAmount: '1200000', isDeductible: true, isExempt: false, expenseType: 'GastosGenerales' }
      ]);
      setBankAccounts([
        { id: 'bank-2', name: 'Banco Nación', cuitBank: '30-50001091-2', accountNumber: '00344-9-122-3', accountType: 'Caja de Ahorro', currency: 'ARS', nominalInitial: '100005', nominalFinal: '350000', tcInitial: '1', tcFinal: '1', interests: '800' }
      ]);
      setWithholdings([
        { amount: '150000', taxCode: 'Ganancias' }
      ]);
      setGeneralDeductions({
        autonomos: '200005',
        servicioDomestico: '0',
        seguroVida: '50000',
        seguroRetiro: '0',
        gastosSepelio: '0',
        interesesHipoteca: '0',
        gastosEducativos: '200000',
        alquilerCasaHabitacion: '0',
        deduccionLocadorLocatario: '0',
        donaciones: '0',
        medicosAsistencial: '0',
        honorariosMedicos: '0',
      });
      setPersonalDeductions({
        tieneConyuge: false,
        cantidadHijos: 0,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Autonomo',
        esJubiladoOchoHaberes: false,
      });
      setPersonalAssets([
        { description: 'Inmueble Particular', type: 'Inmueble', valueInitial: '8000000', valueFinal: '8000000' }
      ]);
      updateCurrentStep(1);
    } else {
      const targetReturn = mockTaxReturns.find(r => r.id === routeReturnId);
      if (targetReturn) {
        setCuit(targetReturn.cuit);
        initialCuitRef.current = targetReturn.cuit;
        setClientName(targetReturn.clientName);
        setFiscalYear(targetReturn.year);
        if (targetReturn.currentStep) {
          updateCurrentStep(Math.min(6, targetReturn.currentStep));
        }
      }
    }
  }, [routeReturnId, resetWizardDetailState, updateCurrentStep]);

  // Hook 1: Cargar estado persistido al iniciar (Mount) e inicializar padrón de contribuyentes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      Promise.all([
        fetch('/api/clientes').then(res => res.json()),
        fetch('/api/declaraciones').then(res => res.json())
      ])
      .then(([clientsRes, returnsRes]) => {
        if (clientsRes.success) setDbClients(clientsRes.data as WizardClient[]);
        if (returnsRes.success) setDbDeclaraciones(returnsRes.data as WizardTaxReturnSummary[]);
      })
      .catch(err => console.error("Error al cargar padrón de base de datos:", err));

      if (routeReturnId) {
        fetch(`/api/declaraciones/${routeReturnId}`)
          .then(res => res.json())
          .then(res => {
            if (res.success && res.data) {
              const data = res.data;
              if (data.cuit) {
                setCuit(data.cuit);
                initialCuitRef.current = data.cuit;
              }
              if (data.clientName) setClientName(data.clientName);
              if (data.fiscalYear) setFiscalYear(data.fiscalYear);
              if (data.taxParameterSetId) setTaxParameterSetId(data.taxParameterSetId);
              if (data.currentStep) updateCurrentStep(Math.min(6, data.currentStep));
              if (data.sales) setSales(data.sales);
              if (data.purchases) setPurchases(data.purchases);
              if (data.fixedAssets) setFixedAssets(data.fixedAssets);
              if (data.initialStock) setInitialStock(data.initialStock);
              if (data.finalStock) setFinalStock(data.finalStock);
              if (data.bankAccounts) setBankAccounts(data.bankAccounts);
              if (data.cashHoldings) setCashHoldings(data.cashHoldings);
              if (data.receivables) setReceivables(data.receivables);
              if (data.liabilities) setLiabilities(data.liabilities);
              if (data.withholdings) setWithholdings(data.withholdings);
              if (data.generalDeductions) setGeneralDeductions(data.generalDeductions);
              if (data.personalDeductions) setPersonalDeductions(data.personalDeductions);
              if (data.personalAssets) setPersonalAssets(data.personalAssets);
              if (data.personalLiabilities) setPersonalLiabilities(data.personalLiabilities);
              if (data.otherJustifications) setOtherJustifications(data.otherJustifications);
              if (data.activoTotalInicio) setActivoTotalInicio(data.activoTotalInicio);
              if (data.pasivoTotalInicio) setPasivoTotalInicio(data.pasivoTotalInicio);
              if (data.bienesNoComputablesInicio) setBienesNoComputablesInicio(data.bienesNoComputablesInicio);
              if (data.saldoAFavorAnterior) setSaldoAFavorAnterior(data.saldoAFavorAnterior);
              if (data.quebrantosAnteriores) setQuebrantosAnteriores(data.quebrantosAnteriores);
              if (data.axiDynamic) setAxiDynamic(data.axiDynamic);
            } else {
              loadFromLocalStorage();
            }
          })
          .catch(err => {
            console.error("Error al cargar la declaración desde la base de datos:", err);
            loadFromLocalStorage();
          })
          .finally(() => {
            setLoadedRouteReturnId(routeReturnId);
          });
      }
    }
  }, [loadFromLocalStorage, routeReturnId, updateCurrentStep]);

  // Hook 2: Auto-Guardar progreso del Wizard en tiempo real (reaccionando a cualquier cambio de estado)
  useEffect(() => {
    if (typeof window !== 'undefined' && cuit && clientName) {
      const wizardState = {
        cuit,
        clientName,
        fiscalYear,
        currentStep,
        taxParameterSetId,
        sales,
        purchases,
        fixedAssets,
        initialStock,
        finalStock,
        bankAccounts,
        cashHoldings,
        receivables,
        liabilities,
        withholdings,
        generalDeductions,
        personalDeductions,
        personalAssets,
        personalLiabilities,
        otherJustifications,
        activoTotalInicio,
        pasivoTotalInicio,
        bienesNoComputablesInicio,
        saldoAFavorAnterior,
        quebrantosAnteriores,
        axiDynamic
      };
      
      const saveKey = activeReturnId || `new_${cuit}`;
      localStorage.setItem(`jaba_wizard_state_${saveKey}`, JSON.stringify(wizardState));
      
      if (!activeReturnId && currentStep > 1 && clientName && cuit) {
        if (isCreatingRef.current) return;
        isCreatingRef.current = true;
        const createPayload = { ...wizardState, status: 'Borrador' };
        
        fetch('/api/declaraciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload)
        })
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data?.id) {
            const newId = res.data.id;
            setPersistedReturnId(newId);
            localStorage.setItem(`jaba_wizard_state_${newId}`, JSON.stringify(createPayload));
            window.location.href = `/declaraciones/${newId}/wizard`;
          } else {
            const duplicateRedirectPath = buildDuplicateTaxReturnRedirectPath(res);
            if (duplicateRedirectPath) {
              window.location.href = duplicateRedirectPath;
              return;
            }

            isCreatingRef.current = false;
          }
        })
        .catch(err => {
          console.error("Error al crear declaración en servidor:", err);
          isCreatingRef.current = false;
        });
      }
    }
  }, [
    activeReturnId, cuit, clientName, fiscalYear, currentStep, taxParameterSetId,
    sales, purchases, fixedAssets, initialStock, finalStock,
    bankAccounts, cashHoldings, receivables, liabilities, withholdings, generalDeductions, personalDeductions,
    personalAssets, personalLiabilities, otherJustifications, activoTotalInicio, pasivoTotalInicio,
    bienesNoComputablesInicio, saldoAFavorAnterior, quebrantosAnteriores, axiDynamic
  ]);

  // Hook 4: Buscar resoluciones para el año seleccionado
  useEffect(() => {
    fetch(`/api/parametros?year=${fiscalYear}&listResolutions=true`)
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          const resolutionData = res.data as TaxResolutionOption[];
          setResolutions(resolutionData);
          // Si el taxParameterSetId actual no está en la lista de resoluciones del nuevo año,
          // o está vacío, asignar la primera por defecto (que es la última versión en orden desc)
          const found = resolutionData.find(r => r.id === taxParameterSetId);
          if (!found && resolutionData.length > 0) {
            setTaxParameterSetId(resolutionData[0].id);
          }
        } else {
          setResolutions([]);
        }
      })
      .catch(err => {
        console.error("Error al obtener resoluciones:", err);
        setResolutions([]);
      });
  }, [fiscalYear, taxParameterSetId]);

  // Hook 5: Cargar detalles de la resolución/parámetros activa para cálculos en tiempo real en el front
  useEffect(() => {
    if (!shouldRequestActiveTaxParameters(taxParameterSetId)) return;

    fetch(`/api/parametros?year=${fiscalYear}&resolutionId=${taxParameterSetId}`)
      .then(res => res.json())
      .then(res => {
        setActiveParamsState({
          taxParameterSetId,
          params: res.success && res.data ? res.data as ActiveTaxParameters : null,
        });
      })
      .catch(err => {
        console.error("Error al obtener detalles de la resolución:", err);
        setActiveParamsState({ taxParameterSetId, params: null });
      });
  }, [fiscalYear, taxParameterSetId]);

  const loadClientHistory = (targetCuit: string, targetName: string, targetYear: number) => {
    void targetCuit;
    void targetName;
    void targetYear;
    // Ya no inyectamos mock data en el onBlur del input, Hook 3 y el detector dinámico de JVP en la UI manejan la importación de saldos del año anterior.
  };

  // ==========================================
  // ESTADOS Y HANDLERS PARA OPERACIONES MASIVAS (BULK) Y TECLADO
  // ==========================================
  const [selectedSales, setSelectedSales] = useState<number[]>([]);
  const [selectedPurchases, setSelectedPurchases] = useState<number[]>([]);

  const handleSelectSale = (index: number) => {
    setSelectedSales(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  const handleSelectAllSales = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSales(sales.map((_, i) => i));
    } else {
      setSelectedSales([]);
    }
  };

  const applyBulkSalesAction = (action: 'exempt' | 'taxable' | 'delete') => {
    if (selectedSales.length === 0) return;
    
    if (action === 'delete') {
      const confirmDelete = window.confirm(`¿Está seguro de eliminar los ${selectedSales.length} registros seleccionados?`);
      if (!confirmDelete) return;
      setSales(sales.filter((_, i) => !selectedSales.includes(i)));
    } else {
      const isExempt = action === 'exempt';
      setSales(sales.map((s, i) => selectedSales.includes(i) ? { ...s, isExempt } : s));
    }
    setSelectedSales([]);
  };

  const handleSelectPurchase = (index: number) => {
    setSelectedPurchases(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
  };

  const handleSelectAllPurchases = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedPurchases(purchases.map((_, i) => i));
    } else {
      setSelectedPurchases([]);
    }
  };

  const applyBulkPurchasesAction = (action: 'deductible' | 'nondeductible' | 'exempt' | 'delete' | string) => {
    if (selectedPurchases.length === 0) return;
    
    if (action === 'delete') {
      const confirmDelete = window.confirm(`¿Está seguro de eliminar los ${selectedPurchases.length} registros seleccionados?`);
      if (!confirmDelete) return;
      setPurchases(purchases.filter((_, i) => !selectedPurchases.includes(i)));
    } else if (action === 'deductible') {
      setPurchases(purchases.map((p, i) => selectedPurchases.includes(i) ? { ...p, isDeductible: true, isExempt: false } : p));
    } else if (action === 'nondeductible') {
      setPurchases(purchases.map((p, i) => selectedPurchases.includes(i) ? { ...p, isDeductible: false, isExempt: false } : p));
    } else if (action === 'exempt') {
      setPurchases(purchases.map((p, i) => selectedPurchases.includes(i) ? { ...p, isDeductible: false, isExempt: true } : p));
    } else if (action.startsWith('type:')) {
      const expenseType = action.replace('type:', '');
      setPurchases(purchases.map((p, i) => selectedPurchases.includes(i) ? { ...p, expenseType } : p));
    }
    setSelectedPurchases([]);
  };

  // Keyboard navigation handlers
  const handleSalesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number, field: 'date' | 'amount') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'date') {
        document.getElementById(`sales-amount-${index}`)?.focus();
      } else if (field === 'amount') {
        if (index === sales.length - 1) {
          addRow('sales');
          setTimeout(() => {
            document.getElementById(`sales-date-${index + 1}`)?.focus();
          }, 50);
        } else {
          document.getElementById(`sales-date-${index + 1}`)?.focus();
        }
      }
    }
  };

  const handlePurchasesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number, field: 'date' | 'amount') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'date') {
        document.getElementById(`purchases-amount-${index}`)?.focus();
      } else if (field === 'amount') {
        if (index === purchases.length - 1) {
          addRow('purchases');
          setTimeout(() => {
            document.getElementById(`purchases-date-${index + 1}`)?.focus();
          }, 50);
        } else {
          document.getElementById(`purchases-date-${index + 1}`)?.focus();
        }
      }
    }
  };

  const handleAssetsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number, field: 'name' | 'cost') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'name') {
        document.getElementById(`assets-cost-${index}`)?.focus();
      } else if (field === 'cost') {
        if (index === fixedAssets.length - 1) {
          addRow('assets');
          setTimeout(() => {
            document.getElementById(`assets-name-${index + 1}`)?.focus();
          }, 50);
        } else {
          document.getElementById(`assets-name-${index + 1}`)?.focus();
        }
      }
    }
  };

  // ==========================================
  // PROCEDIMIENTO DE CARGA MANUAL (ADD/DELETE ROWS)
  // ==========================================
  const addRow = (type: 'sales' | 'purchases' | 'assets' | 'withholdings' | 'personalAssets' | 'bankAccounts' | 'cashHoldings' | 'receivables' | 'liabilities' | 'personalLiabilities' | 'otherJustifications' | 'axiDynamic') => {
    if (type === 'sales') {
      setSales([...sales, { date: `${fiscalYear}-01-01`, netAmount: '0', isExempt: false }]);
    } else if (type === 'purchases') {
      setPurchases([...purchases, { date: `${fiscalYear}-01-01`, netAmount: '0', isDeductible: true, isExempt: false, expenseType: 'GastosGenerales' }]);
    } else if (type === 'assets') {
      const purchaseDate = `${fiscalYear}-01-01`;
      setFixedAssets([...fixedAssets, { id: `asset-${fixedAssets.length + 1}`, name: 'Nuevo Bien', type: 'Equipamiento', purchaseDate, originalCost: '0', usefulLife: 10, yearsElapsed: calculateYearsElapsedAtClose(purchaseDate, fiscalYear), customReexpIndex: '1.0' }]);
    } else if (type === 'withholdings') {
      setWithholdings([...withholdings, { amount: '0', taxCode: 'Ganancias' }]);
    } else if (type === 'personalAssets') {
      setPersonalAssets([...personalAssets, { description: 'Nuevo Activo', type: 'Otros', valueInitial: '0', valueFinal: '0' }]);
    } else if (type === 'bankAccounts') {
      setBankAccounts([...bankAccounts, { id: `bank-${bankAccounts.length + 1}`, name: 'Nuevo Banco', cuitBank: '', accountNumber: '', accountType: 'Cuenta Corriente', currency: 'ARS', nominalInitial: '0', nominalFinal: '0', tcInitial: '1', tcFinal: '1', interests: '0' }]);
    } else if (type === 'cashHoldings') {
      setCashHoldings([...cashHoldings, buildDefaultWizardCashHolding()]);
    } else if (type === 'receivables') {
      setReceivables([...receivables, buildDefaultWizardReceivable()]);
    } else if (type === 'liabilities') {
      setLiabilities([...liabilities, buildDefaultWizardLiability()]);
    } else if (type === 'personalLiabilities') {
      setPersonalLiabilities([...personalLiabilities, { description: 'Nuevo Pasivo', valueInitial: '0', valueFinal: '0' }]);
    } else if (type === 'otherJustifications') {
      setOtherJustifications([...otherJustifications, buildDefaultWizardOtherJustification()]);
    } else if (type === 'axiDynamic') {
      setAxiDynamic([...axiDynamic, { concept: 'Nuevo Ajuste', type: 'RetiroSocio', amount: '0', date: `${fiscalYear}-01-01` }]);
    }
  };

  const deleteRow = (index: number, type: 'sales' | 'purchases' | 'assets' | 'withholdings' | 'personalAssets' | 'bankAccounts' | 'cashHoldings' | 'receivables' | 'liabilities' | 'personalLiabilities' | 'otherJustifications' | 'axiDynamic') => {
    if (type === 'sales') setSales(sales.filter((_, i) => i !== index));
    if (type === 'purchases') setPurchases(purchases.filter((_, i) => i !== index));
    if (type === 'assets') setFixedAssets(fixedAssets.filter((_, i) => i !== index));
    if (type === 'withholdings') setWithholdings(withholdings.filter((_, i) => i !== index));
    if (type === 'personalAssets') setPersonalAssets(personalAssets.filter((_, i) => i !== index));
    if (type === 'bankAccounts') setBankAccounts(bankAccounts.filter((_, i) => i !== index));
    if (type === 'cashHoldings') setCashHoldings(cashHoldings.filter((_, i) => i !== index));
    if (type === 'receivables') setReceivables(receivables.filter((_, i) => i !== index));
    if (type === 'liabilities') setLiabilities(liabilities.filter((_, i) => i !== index));
    if (type === 'personalLiabilities') setPersonalLiabilities(personalLiabilities.filter((_, i) => i !== index));
    if (type === 'otherJustifications') setOtherJustifications(otherJustifications.filter((_, i) => i !== index));
    if (type === 'axiDynamic') setAxiDynamic(axiDynamic.filter((_, i) => i !== index));
  };

  const addOtherJustificationPreset = (key: WizardOtherJustificationPresetKey) => {
    setOtherJustifications([...otherJustifications, buildWizardOtherJustificationFromPreset(key)]);
  };

  const handleCellChange = (index: number, field: string, value: WizardCellValue, type: 'sales' | 'purchases' | 'assets' | 'withholdings' | 'personalAssets' | 'bankAccounts' | 'cashHoldings' | 'receivables' | 'liabilities' | 'personalLiabilities' | 'otherJustifications' | 'axiDynamic') => {
    if (type === 'sales') {
      const updated = [...sales];
      updated[index][field] = value;
      setSales(updated);
    } else if (type === 'purchases') {
      const updated = [...purchases];
      updated[index][field] = value;
      setPurchases(updated);
    } else if (type === 'assets') {
      const updated = [...fixedAssets];
      updated[index][field] = value;
      if (field === 'purchaseDate') {
        const purchaseDate = value instanceof Date || typeof value === 'string' || value == null ? value : String(value);
        updated[index].yearsElapsed = calculateYearsElapsedAtClose(purchaseDate, fiscalYear);
      }
      setFixedAssets(updated);
    } else if (type === 'withholdings') {
      const updated = [...withholdings];
      updated[index][field] = value;
      setWithholdings(updated);
    } else if (type === 'personalAssets') {
      const updated = [...personalAssets];
      updated[index][field] = value;
      setPersonalAssets(updated);
    } else if (type === 'bankAccounts') {
      const updated = [...bankAccounts];
      updated[index][field] = value;
      setBankAccounts(updated);
    } else if (type === 'cashHoldings') {
      const updated = [...cashHoldings];
      updated[index][field] = value;
      setCashHoldings(updated);
    } else if (type === 'receivables') {
      const updated = [...receivables];
      updated[index][field] = value;
      setReceivables(updated);
    } else if (type === 'liabilities') {
      const updated = [...liabilities];
      updated[index][field] = value;
      setLiabilities(updated);
    } else if (type === 'personalLiabilities') {
      const updated = [...personalLiabilities];
      updated[index][field] = value;
      setPersonalLiabilities(updated);
    } else if (type === 'otherJustifications') {
      const updated = [...otherJustifications];
      updated[index][field] = field === 'column' ? coerceWizardOtherJustificationColumn(value as string | number | null | undefined) : value;
      setOtherJustifications(updated);
    } else if (type === 'axiDynamic') {
      const updated = [...axiDynamic];
      updated[index][field] = value;
      setAxiDynamic(updated);
    }
  };

  // ==========================================
  // PROCEDIMIENTO DE IMPORTACIÓN INTERACTIVA (AFIP EXCEL)
  // ==========================================
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'sales' | 'purchases' | 'withholdings') => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json() as ImportResponse;

      if (!result.success) {
        throw new Error(result.error || 'No se pudo procesar el archivo Excel.');
      }

      // Incorporar dinámicamente los registros cargados para que el usuario los verifique en pantalla
      if (type === 'sales' && result.data?.sales) {
        const parsed = result.data.sales.map(s => ({
          date: new Date(s.date).toISOString().split('T')[0],
          netAmount: s.netAmount,
          isExempt: s.isExempt,
          invoiceType: s.invoiceType,
          invoiceNumber: s.invoiceNumber,
          customerName: s.customerName,
          counterpartyCuit: s.counterpartyCuit,
          ivaAmount: s.ivaAmount,
          totalAmount: s.totalAmount,
        }));
        setSales([...sales, ...parsed]);
      } else if (type === 'purchases' && result.data?.purchases) {
        const parsed = result.data.purchases.map(p => ({
          date: new Date(p.date).toISOString().split('T')[0],
          netAmount: p.netAmount,
          isDeductible: p.isDeductible,
          isExempt: p.isExempt,
          expenseType: p.expenseType || 'GastosGenerales',
          invoiceType: p.invoiceType,
          invoiceNumber: p.invoiceNumber,
          vendorName: p.vendorName,
          counterpartyCuit: p.counterpartyCuit,
          ivaAmount: p.ivaAmount,
          totalAmount: p.totalAmount,
        }));
        setPurchases([...purchases, ...parsed]);
      } else if (type === 'withholdings' && result.data?.withholdings) {
        const parsed = result.data.withholdings.map(w => ({
          amount: w.amount,
          taxCode: w.taxCode
        }));
        setWithholdings([...withholdings, ...parsed]);
      }

    } catch (err: unknown) {
      setUploadError(errorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  // ==========================================
  // EJECUCIÓN DEL MOTOR DE CÁLCULO IMPOSTIVO
  // ==========================================
  const fallbackParameterSet = {
    minimoNoImponible: 4507505.52,
    conyuge: 4245166.13,
    hijo: 2140852.77,
    hijoIncapacitado: 4281705.53,
    especialAutonomo: 15776269.32,
    especialEmprendedor: 18030022.08,
    especialDependiente: 21636026.50,
    topeServicioDomestico: 4507505.52,
    topeSeguroVida: 573817.13,
    topeSeguroRetiro: 573817.13,
    topeGastosSepelio: 996.23,
    topeInteresHipoteca: 20000.00,
    topeGastosEducativos: 1803002.21,
  };

  const calculationParams = activeParams
    ? {
        ...activeParams,
        brackets: activeParams.brackets && activeParams.brackets.length > 0 ? activeParams.brackets : escala2025BracketMock,
        indices: activeParams.indices ?? [],
      }
    : {
        parameterSet: fallbackParameterSet,
        brackets: escala2025BracketMock,
        indices: [],
      };

  const calculationData = {
    clientName,
    cuit,
    fiscalYear,
    sales,
    purchases,
    fixedAssets,
    initialStock,
    finalStock,
    bankAccounts,
    cashHoldings,
    receivables,
    liabilities,
    withholdings,
    generalDeductions,
    personalDeductions,
    personalAssets,
    personalLiabilities,
    otherJustifications,
    activoTotalInicio,
    bienesNoComputablesInicio,
    pasivoTotalInicio,
    axiDynamic,
    saldoAFavorAnterior,
    quebrantosAnteriores,
  };

  const calculationRequestKey = JSON.stringify({
    declarationData: calculationData,
    taxParameters: calculationParams,
  });

  const hasRequiredPreviewIdentity = clientName.trim() !== '' && cuit.trim() !== '';

  const executeCalculation = () => {
    const calculationInput = buildTaxReturnCalculationInput(calculationData, calculationParams);
    return calculateTaxReturn(calculationInput);
  };

  const localCalculationResult = hasRequiredPreviewIdentity ? executeCalculation() : null;

  useEffect(() => {
    if (!hasRequiredPreviewIdentity) return;

    const key = calculationRequestKey;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsBackendPreviewPending(true);
      setBackendPreviewError(null);
      const previewRequest = buildTaxReturnPreviewRequest(
        JSON.parse(key) as { declarationData: unknown; taxParameters: unknown }
      );

      fetch(previewRequest.url, { ...previewRequest.init, signal: controller.signal })
        .then(async response => {
          const res = await response.json();
          if (response.ok && res.success && res.data) {
            setBackendPreview({
              key,
              result: hydrateTaxReturnPreviewResult(res.data),
            });
            setBackendPreviewError(null);
          } else {
            const message = res.error || 'Preview backend no disponible';
            setBackendPreviewError(message);
            console.error('Error al calcular preview backend:', message);
          }
        })
        .catch(err => {
          const errorName = err instanceof Error ? err.name : '';
          if (errorName !== 'AbortError') {
            const message = err instanceof Error ? err.message : 'Error de red desconocido';
            setBackendPreviewError(message);
            console.error('Error de red al calcular preview backend:', err);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsBackendPreviewPending(false);
          }
        });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [calculationRequestKey, hasRequiredPreviewIdentity]);

  const calculationResult = backendPreview?.key === calculationRequestKey
    ? backendPreview.result
    : localCalculationResult;

  const previewStatus = buildTaxReturnPreviewStatus({
    hasRequiredPreviewIdentity,
    calculationRequestKey,
    backendPreviewKey: backendPreview?.key ?? null,
    isBackendPreviewPending,
    backendPreviewError,
  });

  const previewStatusClasses = {
    idle: 'border-zinc-700 bg-zinc-900/70 text-zinc-400',
    backend: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    fallback: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  }[previewStatus.kind];

  const previewStatusDotClasses = {
    idle: 'bg-zinc-500',
    backend: 'bg-emerald-400',
    pending: 'bg-amber-400 animate-pulse',
    fallback: 'bg-sky-400',
  }[previewStatus.kind];

  // Buscar si el cliente actual (según el CUIT ingresado) tiene una DDJJ anterior cerrada en la BD o mock
  const clientObj = dbClients.find(c => c.cuit === cuit) || mockClients.find(c => c.cuit === cuit);
  const previousReturnObj = clientObj 
    ? (dbDeclaraciones.find(r => r.cuit === cuit && r.year === fiscalYear - 1 && r.status === 'Cerrada') || 
       mockTaxReturns.find(r => r.clientId === clientObj.id && r.year === fiscalYear - 1 && r.status === 'Cerrada'))
    : null;

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200">
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-wizard-scrollbar::-webkit-scrollbar {
          height: 5px;
        }
        .custom-wizard-scrollbar::-webkit-scrollbar-track {
          background: #121216;
        }
        .custom-wizard-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 4px;
        }
        .custom-wizard-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #14b8a6;
        }
      `}} />

      {isLoadingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/80 backdrop-blur-md transition-all">
          <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500 animate-pulse"></div>
            <div className="h-12 w-12 border-4 border-teal-500/25 border-t-teal-400 rounded-full animate-spin mx-auto"></div>
            <h3 className="text-base font-bold text-white">Cargando Declaración Impositiva</h3>
            <p className="text-zinc-400 text-xs">Recuperando registros e histórico de base de datos...</p>
          </div>
        </div>
      )}

      {/* HEADER DE WIZARD */}
      <header className="border-b border-[#1e1e24] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:text-teal-400 transition-colors flex items-center gap-1.5 text-xs text-zinc-400 font-bold uppercase tracking-wider">
              <ArrowLeft className="h-4 w-4" />
              Volver al Dashboard
            </Link>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-teal-500/10 flex items-center justify-center text-teal-400">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-zinc-300">Asistente de Liquidación JABA</span>
          </div>

          <div className="text-xs text-zinc-500 font-semibold">
            Paso {currentStep} de 6
          </div>
        </div>
      </header>

      {/* BARRA DE PROGRESO DE 6 PASOS (STITCH UI PROGRESS LINE) */}
      <div className="bg-[#121216] border-b border-zinc-850 py-4 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            'Contribuyente y Perfil', 'Ingresos y Ventas', 'Gastos y Existencias',
            'Patrimonio y Bienes', 'Deducciones y Ajustes', 'Liquidación y Cierre'
          ].map((stepName, index) => {
            const stepNum = index + 1;
            const isActive = currentStep === stepNum;
            const hasData = checkIfStepHasData(stepNum);
            const isVisited = stepNum < maxVisitedStep;
            
            return (
              <button 
                key={stepNum}
                onClick={() => changeStep(stepNum)}
                className={`flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 text-left focus:outline-none w-full relative ${
                  isActive ? 'bg-teal-500/10 border-teal-500/50 shadow-md shadow-teal-500/5' :
                  hasData ? 'bg-[#09090b] border-zinc-800/80 hover:border-teal-500/30' :
                  isVisited ? 'bg-[#09090b] border-zinc-800/80 hover:border-amber-500/30' :
                  'bg-zinc-950/20 border-zinc-900/50 opacity-60 hover:opacity-100 hover:border-zinc-800'
                }`}
              >
                {/* Indicador de barra de progreso superior activo */}
                {isActive && (
                  <div className="absolute top-0 left-2 right-2 h-[2px] bg-teal-500 rounded-b"></div>
                )}
                
                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all shrink-0 ${
                  isActive ? 'bg-teal-500 text-[#09090b] border-teal-500 shadow-md shadow-teal-500/20' :
                  hasData ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' :
                  isVisited ? 'bg-amber-500/10 text-amber-450 border-amber-500/25' :
                  'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}>
                  {isActive ? stepNum : (hasData ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : (isVisited ? <span className="text-[9px] font-extrabold">-</span> : stepNum))}
                </div>
                
                <div className="flex flex-col min-w-0">
                  <span className={`text-[10px] font-bold leading-tight truncate transition-colors ${
                    isActive ? 'text-teal-400 font-extrabold' : 
                    hasData ? 'text-zinc-300' : 
                    isVisited ? 'text-amber-450/80' : 
                    'text-zinc-500 group-hover:text-zinc-400'
                  }`} title={stepName}>
                    {stepName}
                  </span>
                  {!isActive && isVisited && !hasData && (
                    <span className="text-[8px] text-amber-550/90 font-black tracking-tight leading-none mt-0.5 uppercase">
                      Sin datos
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENIDO DEL WIZARD */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        
        {/* ENVASE DE CONTENIDO (GLASSMORPHISM PANEL) */}
        <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 shadow-2xl">
          
          {/* PASO 1: IDENTIFICACIÓN DEL CLIENTE Y PERÍODO */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Paso 1: Identificación del Contribuyente</h2>
                <p className="text-zinc-400 text-xs mt-1">Configure los datos cualitativos principales del cliente y el año de liquidación.</p>
              </div>

              {step1Error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Acción Bloqueada: Contribuyente No Registrado</span>
                    <p className="text-zinc-300 mt-1 leading-normal">{step1Error}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                {/* Nombre o Razón Social Autocomplete Dropdown */}
                <div className="space-y-2 relative">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Nombre o Razón Social</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={clientName || ''}
                      onChange={(e) => {
                        setClientName(e.target.value);
                        resetWizardDetailsAfterIdentityChange();
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => {
                        // Esperar un instante por si se está haciendo click en una opción del dropdown
                        setTimeout(() => {
                          loadClientHistory(cuit, clientName, fiscalYear);
                        }, 200);
                      }}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="Busque por nombre/cuit o escriba nuevo..."
                    />
                    <button 
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-bold focus:outline-none"
                    >
                      {isDropdownOpen ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Dropdown Options List */}
                  {isDropdownOpen && dbClients.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[#121216]/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-50 divide-y divide-zinc-850">
                      {dbClients
                        .filter(c => {
                          const isExactMatch = dbClients.some(mc => mc.name === clientName);
                          if (!clientName || isExactMatch) return true;
                          return c.name.toLowerCase().includes(clientName.toLowerCase()) || 
                                 c.cuit.includes(clientName);
                        })
                        .map(client => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              setClientName(client.name);
                              setCuit(client.cuit);
                              resetWizardDetailsAfterIdentityChange();
                              setIsDropdownOpen(false);
                              loadClientHistory(client.cuit, client.name, fiscalYear);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-teal-500/10 hover:text-teal-400 transition-colors text-xs space-y-0.5 focus:outline-none block"
                          >
                            <span className="font-bold text-white block">{client.name}</span>
                            <span className="text-[10px] text-zinc-550 font-mono block">CUIT: {client.cuit} • {client.fiscalCondition}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">CUIT (Formato Oficial)</label>
                  <input 
                    type="text" 
                    value={cuit || ''}
                    onChange={(e) => {
                      setCuit(formatCuit(e.target.value));
                      resetWizardDetailsAfterIdentityChange();
                    }}
                    onBlur={() => loadClientHistory(cuit, clientName, fiscalYear)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    placeholder="Ej: 20-34590216-4"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Período Fiscal</label>
                  <select 
                    value={fiscalYear}
                    onChange={(e) => {
                      const newYear = Number(e.target.value);
                      setFiscalYear(newYear);
                      loadClientHistory(cuit, clientName, newYear);
                    }}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025 (Activo)</option>
                    <option value={2024}>2024 (Histórico)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Resolución Normativa / Escala Aplicable</label>
                  <select 
                    value={taxParameterSetId}
                    onChange={(e) => setTaxParameterSetId(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                  >
                    {resolutions.length > 0 ? (
                      resolutions.map(res => (
                        <option key={res.id} value={res.id}>
                          {res.resolution} (v{res.version})
                        </option>
                      ))
                    ) : (
                      <option value="">No hay resoluciones registradas (Use v1 ARCA o Parámetros)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* SECCIÓN: PERFIL IMPOSITIVO Y FISCAL */}
              <div className="border-t border-zinc-800 pt-6 mt-8 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-teal-400 uppercase tracking-wider">
                  <Sparkles className="h-4.5 w-4.5" />
                  Perfil Impositivo y Cargas de Familia
                </div>
                <p className="text-xs text-zinc-400 leading-normal">
                  Configure las deducciones personales correspondientes a las cargas de familia y tipo de deducción especial del contribuyente.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-[#09090b] border border-zinc-850">
                    <div>
                      <span className="text-sm font-semibold text-white block">Cónyuge o Conviviente a cargo</span>
                      <span className="text-[10px] text-zinc-500">Debe poseer ingresos menores al MNI impositivo.</span>
                    </div>
                    <input 
                      type="checkbox"
                      checked={personalDeductions.tieneConyuge}
                      onChange={(e) => setPersonalDeductions({...personalDeductions, tieneConyuge: e.target.checked})}
                      className="h-5 w-5 rounded bg-zinc-900 border-zinc-800 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-[#09090b] border border-zinc-850">
                    <div>
                      <span className="text-sm font-semibold text-white block">Jubilado con 8+ Haberes Mínimos</span>
                      <span className="text-[10px] text-zinc-500">Deducción específica de 8 haberes (reemplaza MNI y ded. especial).</span>
                    </div>
                    <input 
                      type="checkbox"
                      checked={personalDeductions.esJubiladoOchoHaberes}
                      onChange={(e) => setPersonalDeductions({...personalDeductions, esJubiladoOchoHaberes: e.target.checked})}
                      className="h-5 w-5 rounded bg-zinc-900 border-zinc-800 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Cantidad de Hijos a cargo</label>
                    <input 
                      type="number"
                      value={personalDeductions.cantidadHijos ?? 0}
                      onChange={(e) => setPersonalDeductions({...personalDeductions, cantidadHijos: Math.max(0, parseInt(e.target.value) || 0)})}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs uppercase font-bold text-zinc-550 tracking-wider">Hijos Incapacitados para el Trabajo</label>
                    <input 
                      type="number"
                      value={personalDeductions.cantidadHijosIncapacitados ?? 0}
                      onChange={(e) => setPersonalDeductions({...personalDeductions, cantidadHijosIncapacitados: Math.max(0, parseInt(e.target.value) || 0)})}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider">Tipo de Deducción Especial (Art. 30)</label>
                    <select 
                      value={personalDeductions.tipoDeduccionEspecial}
                      onChange={(e) => setPersonalDeductions({...personalDeductions, tipoDeduccionEspecial: coerceWizardPersonalDeductionType(e.target.value)})}
                      className="w-full h-11 px-4 rounded-lg bg-[#09090b] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                    >
                      <option value="Autonomo">Autónomos General (1.5x MNI)</option>
                      <option value="Emprendedor">Nuevas Profesiones / Emprendedores (2x MNI)</option>
                      <option value="Dependiente">Trabajadores en Relación de Dependencia / Jubilados (3.8x MNI)</option>
                      <option value="Ninguna">Ninguna</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECCIÓN: ESTADO DE RESULTADOS / SALDOS ANTERIORES */}
              <div className="border-t border-zinc-800 pt-6 mt-8 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-teal-400 uppercase tracking-wider">
                  <Sparkles className="h-4.5 w-4.5" />
                  Saldos Iniciales y Patrimonio del Año Anterior
                </div>
                
                <p className="text-xs text-zinc-400 leading-normal">
                  Para justificar la variación patrimonial anual e iniciar el cálculo de inflación (Estático AXI), se requiere cargar el patrimonio del ejercicio anterior.
                </p>

                {/* Detector de DDJJ Anterior Dinámico */}
                {previousReturnObj && (
                  <div className="p-4 rounded-lg bg-teal-500/5 border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-white block">DDJJ del Período Anterior Detectada</span>
                      <span className="text-[10px] text-zinc-450 block">Se encontró la Declaración Jurada del período {fiscalYear - 1} de {clientObj?.name} (Cerrada) en el sistema.</span>
                    </div>
                    <button
                      onClick={() => {
                        if (previousReturnObj.id === 'return-3') {
                          setActivoTotalInicio('18400000');
                          setPasivoTotalInicio('0');
                          setBienesNoComputablesInicio('1500000');
                          setInitialStock('2000000');
                          setBankAccounts([
                            { id: 'bank-1', name: 'Banco Galicia', cuitBank: '30-50001087-9', accountNumber: '00123-4-567-8', accountType: 'Cuenta Corriente', currency: 'ARS', nominalInitial: '480000', nominalFinal: '480000', tcInitial: '1', tcFinal: '1', interests: '1500' }
                          ]);
                          alert(`¡Saldos del ejercicio anterior (${fiscalYear - 1}) importados con éxito! Los saldos iniciales y existencias se han cargado en el patrimonio de inicio.`);
                        } else {
                          setIsHistoryImportLoading(true);
                          fetch(`/api/declaraciones/${previousReturnObj.id}`)
                            .then(res => res.json())
                            .then(res => {
                              if (res.success && res.data) {
                                const prevData = res.data as WizardPreviousReturnData;
                                let totalActivosCierre = new Decimal(0);

                                // Existencias
                                const stockFinal = new Decimal(prevData.finalStock || 0);
                                totalActivosCierre = totalActivosCierre.plus(stockFinal);
                                setInitialStock(wizardMoneyToString(prevData.finalStock));

                                // Disponibilidades
                                const bankMapped = (prevData.bankAccounts || []).map(b => {
                                  const balFinal = new Decimal(b.nominalFinal || 0);
                                  const tcFinal = new Decimal(b.tcFinal || 1.0);
                                  totalActivosCierre = totalActivosCierre.plus(balFinal.mul(tcFinal));
                                  return {
                                    id: `bank-${Date.now()}-${Math.random()}`,
                                    name: b.name || '',
                                    cuitBank: b.cuitBank || '',
                                    accountNumber: b.accountNumber || '',
                                    accountType: b.accountType || 'Cuenta Corriente',
                                    currency: b.currency || 'ARS',
                                    nominalInitial: b.nominalFinal || '0',
                                    nominalFinal: '0',
                                    tcInitial: b.tcFinal || '1',
                                    tcFinal: '1',
                                    interests: '0'
                                  };
                                });
                                setBankAccounts(bankMapped);

                                // Activos Personales
                                const assetsMapped = (prevData.personalAssets || []).map(a => {
                                  const vFinal = new Decimal(a.valueFinal || 0);
                                  totalActivosCierre = totalActivosCierre.plus(vFinal);
                                  return {
                                    description: a.description || '',
                                    type: a.type || 'Otros',
                                    valueInitial: a.valueFinal || '0',
                                    valueFinal: '0'
                                  };
                                });
                                setPersonalAssets(assetsMapped);

                                // Bienes de Uso (Amortización)
                                const fixedMapped = (prevData.fixedAssets || []).map(a => {
                                  totalActivosCierre = totalActivosCierre.plus(new Decimal(a.originalCost || 0));
                                  return {
                                    id: `asset-${Date.now()}-${Math.random()}`,
                                    name: a.name || '',
                                    type: a.type || 'Otro',
                                    purchaseDate: a.purchaseDate,
                                    originalCost: a.originalCost,
                                    usefulLife: a.usefulLife,
                                    yearsElapsed: wizardMoneyToNumber(a.yearsElapsed) + 1,
                                    customReexpIndex: '1.0'
                                  };
                                });
                                setFixedAssets(fixedMapped);

                                setActivoTotalInicio(totalActivosCierre.toString());
                                setPasivoTotalInicio('0');
                                setBienesNoComputablesInicio('0');

                                alert(`¡Saldos históricos e inventarios del período anterior (${fiscalYear - 1}) importados con éxito!`);
                              }
                            })
                            .catch(err => {
                              console.error("Error al importar DDJJ histórica:", err);
                              alert("No se pudo importar automáticamente la DDJJ del período anterior.");
                            })
                            .finally(() => setIsHistoryImportLoading(false));
                        }
                      }}
                      className="px-4 h-9 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs transition-colors shrink-0 cursor-pointer"
                    >
                      Importar Automáticamente
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-lg bg-[#09090b] border border-zinc-850">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Activo Total al Inicio ($)</label>
                    <input 
                      type="number" 
                      value={activoTotalInicio ?? ''}
                      onChange={(e) => setActivoTotalInicio(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[#121216] border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="Activo Inicial"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Pasivo Total al Inicio ($)</label>
                    <input 
                      type="number" 
                      value={pasivoTotalInicio ?? ''}
                      onChange={(e) => setPasivoTotalInicio(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[#121216] border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="Pasivo Inicial"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Bienes No Computables al Inicio ($)</label>
                    <input 
                      type="number" 
                      value={bienesNoComputablesInicio ?? ''}
                      onChange={(e) => setBienesNoComputablesInicio(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[#121216] border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="Bienes No Computables"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: INGRESOS Y VENTAS */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Paso 2: Ventas e Ingresos Comerciales</h2>
                  <p className="text-zinc-400 text-xs mt-1">Cargue el detalle de facturación emitida. Puede subir el Excel de AFIP directamente.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {sales.length > 0 && (
                    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/25">
                      <div className="text-left">
                        <span className="text-[9px] uppercase tracking-wider text-teal-400 block font-bold">Total Ventas</span>
                        <span className="text-sm font-bold font-mono text-teal-300">
                          ${sales.reduce((sum, s) => sum.add(new Decimal(s.netAmount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="h-6 w-[1px] bg-teal-500/20"></div>
                      <div className="text-left text-[10px] text-zinc-400">
                        <span className="block font-semibold">Gravado: <span className="font-mono text-zinc-200">${sales.filter(s => !s.isExempt).reduce((sum, s) => sum.add(new Decimal(s.netAmount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                        <span className="block font-semibold">Exento: <span className="font-mono text-zinc-200">${sales.filter(s => s.isExempt).reduce((sum, s) => sum.add(new Decimal(s.netAmount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileUpload(e, 'sales')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      disabled={isUploading}
                    />
                    <button className="flex items-center gap-2 h-9 px-4 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs transition-colors">
                      <Upload className="h-4 w-4" />
                      {isUploading ? 'Procesando...' : 'Importar Excel AFIP'}
                    </button>
                  </div>
                </div>
              </div>

              {uploadError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-400 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* ACCIONES MASIVAS - BULK ACTIONS PANEL */}
              {selectedSales.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-teal-500/10 border border-teal-500/25 mb-4 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-teal-300">{selectedSales.length} Ventas seleccionadas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => applyBulkSalesAction('taxable')}
                      className="px-3 h-8 rounded bg-zinc-900 border border-zinc-800 hover:border-teal-500/30 text-[10px] font-bold text-teal-400 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Marcar Gravado
                    </button>
                    <button
                      onClick={() => applyBulkSalesAction('exempt')}
                      className="px-3 h-8 rounded bg-zinc-900 border border-zinc-800 hover:border-teal-500/30 text-[10px] font-bold text-teal-400 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Marcar Exento
                    </button>
                    <button
                      onClick={() => applyBulkSalesAction('delete')}
                      className="px-3 h-8 rounded bg-red-950/20 border border-red-500/20 text-[10px] font-bold text-red-400 hover:border-red-500/40 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* GRILLA INTERACTIVA EDITABLE (STITCH INTERACTIVE TABLE) */}
              <div className="border border-zinc-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                      <th className="px-4 py-3 w-10 text-center">
                        <input 
                          type="checkbox"
                          checked={sales.length > 0 && selectedSales.length === sales.length}
                          onChange={handleSelectAllSales}
                          className="h-4 w-4 rounded bg-zinc-900 border-zinc-800 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Comprobante / Contraparte</th>
                      <th className="px-4 py-3 text-right">Importe Neto ($)</th>
                      <th className="px-4 py-3 text-center">Tipo de Ingreso</th>
                      <th className="px-4 py-3 text-right">Eliminar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850/50">
                    {sales.map((sale, index) => {
                      const invoiceTrace = buildInvoiceTraceSummary({
                        invoiceType: sale.invoiceType,
                        invoiceNumber: sale.invoiceNumber,
                        counterpartyName: sale.customerName,
                        counterpartyCuit: sale.counterpartyCuit,
                        ivaAmount: sale.ivaAmount,
                        totalAmount: sale.totalAmount,
                      });

                      return (
                      <tr key={index} className={`hover:bg-zinc-800/10 transition-colors ${selectedSales.includes(index) ? 'bg-teal-500/5' : ''}`}>
                        <td className="px-4 py-2 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedSales.includes(index)}
                            onChange={() => handleSelectSale(index)}
                            className="h-4 w-4 rounded bg-zinc-900 border-zinc-800 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input 
                            type="date"
                            id={`sales-date-${index}`}
                            value={sale.date || ''}
                            onChange={(e) => handleCellChange(index, 'date', e.target.value, 'sales')}
                            onKeyDown={(e) => handleSalesKeyDown(e, index, 'date')}
                            className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full"
                          />
                        </td>
                        <td className="px-4 py-2 min-w-[230px]">
                          <div className={invoiceTrace.hasTrace ? 'text-[11px] font-bold text-zinc-200' : 'text-[11px] font-semibold text-zinc-500'}>
                            {invoiceTrace.primary}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate" title={invoiceTrace.secondary}>
                            {invoiceTrace.secondary}
                          </div>
                          {invoiceTrace.amounts && (
                            <div className="text-[10px] text-teal-400/80 font-mono mt-0.5">
                              {invoiceTrace.amounts}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input 
                            type="number"
                            id={`sales-amount-${index}`}
                            value={sale.netAmount ?? ''}
                            onChange={(e) => handleCellChange(index, 'netAmount', e.target.value, 'sales')}
                            onKeyDown={(e) => handleSalesKeyDown(e, index, 'amount')}
                            className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <select
                            value={sale.isExempt ? 'true' : 'false'}
                            onChange={(e) => handleCellChange(index, 'isExempt', e.target.value === 'true', 'sales')}
                            className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                          >
                            <option value="false">Gravado (Ganancias)</option>
                            <option value="true">Exento (Monotributo/Ley)</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button 
                            onClick={() => deleteRow(index, 'sales')}
                            className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button 
                onClick={() => addRow('sales')}
                className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider"
              >
                <Plus className="h-4 w-4 stroke-[3.5]" />
                Añadir Fila Manual
              </button>
            </div>
          )}

          {/* PASO 3: CARGA DE COMPRAS Y GASTOS CON CMV */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Paso 3: Gastos Comerciales y Existencias</h2>
                  <p className="text-zinc-400 text-xs mt-1">Cargue el detalle de compras impositivas y declare los bienes de cambio para el cálculo automático de CMV en vivo.</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {purchases.length > 0 && (
                    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/25">
                      <div className="text-left">
                        <span className="text-[9px] uppercase tracking-wider text-teal-400 block font-bold">Total Compras</span>
                        <span className="text-sm font-bold font-mono text-teal-300">
                          ${purchases.reduce((sum, p) => sum.add(new Decimal(p.netAmount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="h-6 w-[1px] bg-teal-500/20"></div>
                      <div className="text-left text-[10px] text-zinc-400">
                        <span className="block font-semibold">Deducible: <span className="font-mono text-zinc-200">${purchases.filter(p => p.isDeductible).reduce((sum, p) => sum.add(new Decimal(p.netAmount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                        <span className="block font-semibold">Exento/No Ded: <span className="font-mono text-zinc-200">${purchases.filter(p => !p.isDeductible).reduce((sum, p) => sum.add(new Decimal(p.netAmount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileUpload(e, 'purchases')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      disabled={isUploading}
                    />
                    <button className="flex items-center gap-2 h-9 px-4 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs transition-colors cursor-pointer">
                      <Upload className="h-4 w-4" />
                      {isUploading ? 'Procesando...' : 'Importar Excel AFIP'}
                    </button>
                  </div>
                </div>
              </div>

              {/* ACCIONES MASIVAS - BULK ACTIONS PANEL */}
              {selectedPurchases.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-teal-500/10 border border-teal-500/25 mb-4 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-teal-300">{selectedPurchases.length} Compras seleccionadas</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => applyBulkPurchasesAction('deductible')}
                      className="px-3 h-8 rounded bg-zinc-900 border border-zinc-800 hover:border-teal-500/30 text-[10px] font-bold text-teal-400 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Deducible
                    </button>
                    <button
                      onClick={() => applyBulkPurchasesAction('nondeductible')}
                      className="px-3 h-8 rounded bg-zinc-900 border border-zinc-800 hover:border-teal-500/30 text-[10px] font-bold text-teal-400 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      No Deducible
                    </button>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          applyBulkPurchasesAction(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="bg-[#09090b] border border-zinc-800 rounded px-2 h-8 text-[10px] text-zinc-300 font-bold uppercase tracking-wider focus:outline-none cursor-pointer"
                    >
                      <option value="">Tipo de Gasto...</option>
                      <option value="type:GastosGenerales">Gastos Generales</option>
                      <option value="type:MateriaPrima">Materia Prima</option>
                      <option value="type:Servicios">Servicios Básicos</option>
                      <option value="type:Impuestos">Impuestos / Tasas</option>
                      <option value="type:Amortizaciones">Amortizaciones</option>
                    </select>
                    <button
                      onClick={() => applyBulkPurchasesAction('delete')}
                      className="px-3 h-8 rounded bg-red-950/20 border border-red-500/20 text-[10px] font-bold text-red-400 hover:border-red-500/40 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-zinc-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                      <th className="px-4 py-3 w-10 text-center">
                        <input 
                          type="checkbox"
                          checked={purchases.length > 0 && selectedPurchases.length === purchases.length}
                          onChange={handleSelectAllPurchases}
                          className="h-4 w-4 rounded bg-zinc-900 border-zinc-800 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                        />
                      </th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Comprobante / Proveedor</th>
                      <th className="px-4 py-3 text-right">Importe Neto ($)</th>
                      <th className="px-4 py-3 text-center">Tratamiento</th>
                      <th className="px-4 py-3 text-center">Tipo Gasto</th>
                      <th className="px-4 py-3 text-right">Eliminar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850/50">
                    {purchases.map((purchase, index) => {
                      const invoiceTrace = buildInvoiceTraceSummary({
                        invoiceType: purchase.invoiceType,
                        invoiceNumber: purchase.invoiceNumber,
                        counterpartyName: purchase.vendorName,
                        counterpartyCuit: purchase.counterpartyCuit,
                        ivaAmount: purchase.ivaAmount,
                        totalAmount: purchase.totalAmount,
                      });

                      return (
                      <tr key={index} className={`hover:bg-zinc-800/10 transition-colors ${selectedPurchases.includes(index) ? 'bg-teal-500/5' : ''}`}>
                        <td className="px-4 py-2 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedPurchases.includes(index)}
                            onChange={() => handleSelectPurchase(index)}
                            className="h-4 w-4 rounded bg-zinc-900 border-zinc-800 text-teal-500 focus:ring-teal-500/50 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input 
                            type="date"
                            id={`purchases-date-${index}`}
                            value={purchase.date || ''}
                            onChange={(e) => handleCellChange(index, 'date', e.target.value, 'purchases')}
                            onKeyDown={(e) => handlePurchasesKeyDown(e, index, 'date')}
                            className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full"
                          />
                        </td>
                        <td className="px-4 py-2 min-w-[230px]">
                          <div className={invoiceTrace.hasTrace ? 'text-[11px] font-bold text-zinc-200' : 'text-[11px] font-semibold text-zinc-500'}>
                            {invoiceTrace.primary}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate" title={invoiceTrace.secondary}>
                            {invoiceTrace.secondary}
                          </div>
                          {invoiceTrace.amounts && (
                            <div className="text-[10px] text-teal-400/80 font-mono mt-0.5">
                              {invoiceTrace.amounts}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input 
                            type="number"
                            id={`purchases-amount-${index}`}
                            value={purchase.netAmount ?? ''}
                            onChange={(e) => handleCellChange(index, 'netAmount', e.target.value, 'purchases')}
                            onKeyDown={(e) => handlePurchasesKeyDown(e, index, 'amount')}
                            className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <select
                            value={purchase.isDeductible ? 'deductible' : 'non-deductible'}
                            onChange={(e) => handleCellChange(index, 'isDeductible', e.target.value === 'deductible', 'purchases')}
                            className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                          >
                            <option value="deductible">Deducible en Ganancias</option>
                            <option value="non-deductible">No Deducible / Gto. Personal</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <select
                            value={purchase.expenseType}
                            onChange={(e) => handleCellChange(index, 'expenseType', e.target.value, 'purchases')}
                            className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                          >
                            <option value="GastosGenerales">Gastos Generales</option>
                            <option value="MateriaPrima">Materia Prima / Insumos</option>
                            <option value="Servicios">Servicios Básicos</option>
                            <option value="Alquiler">Alquileres</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button 
                            onClick={() => deleteRow(index, 'purchases')}
                            className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button 
                onClick={() => addRow('purchases')}
                className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
              >
                <Plus className="h-4 w-4 stroke-[3.5]" />
                Añadir Fila Manual
              </button>

              {/* SECCIÓN: EXISTENCIAS Y CÁLCULO DE COSTO DE VENTAS (CMV) */}
              <div className="border-t border-zinc-800 pt-6 mt-6 space-y-4">
                <div>
                  <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Valuación Impositiva de Bienes de Cambio</h3>
                  <p className="text-zinc-400 text-[11px] mt-1">Declare los inventarios de mercaderías al inicio y al cierre del ejercicio impositivo para determinar el CMV.</p>
                </div>

                {(() => {
                  const comprasTotal = purchases.reduce((sum, p) => sum.add(new Decimal(p.netAmount || 0)), new Decimal(0));
                  const ei = new Decimal(initialStock || 0);
                  const ef = new Decimal(finalStock || 0);
                  const cmvCalculated = ei.add(comprasTotal).sub(ef);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 p-5 rounded-xl bg-[#09090b] border border-zinc-850 items-center">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Existencia Inicial (al 01/01/{fiscalYear})</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">$</span>
                          <input 
                            type="number" 
                            value={initialStock ?? ''}
                            onChange={(e) => setInitialStock(e.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-lg bg-[#121216] border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Existencia Final (al 31/12/{fiscalYear})</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">$</span>
                          <input 
                            type="number" 
                            value={finalStock ?? ''}
                            onChange={(e) => setFinalStock(e.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-lg bg-[#121216] border border-zinc-800 text-xs font-mono text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-2 p-4 rounded-xl bg-teal-500/5 border border-teal-500/25 text-right space-y-1">
                        <span className="text-[9px] uppercase font-extrabold tracking-wider text-teal-400 block">Costo de Mercaderías Vendidas (CMV) en Vivo</span>
                        <div className="text-lg font-black font-mono text-white">
                          ${cmvCalculated.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <span className="text-[9px] font-bold text-zinc-400 block">
                          CMV = EI (${ei.toNumber().toLocaleString('es-AR')}) + Compras (${comprasTotal.toNumber().toLocaleString('es-AR')}) - EF (${ef.toNumber().toLocaleString('es-AR')})
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* PASO 4: PATRIMONIO Y ACTIVOS FIJOS */}
          {currentStep === 4 && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Paso 4: Patrimonio y Activos Fijos</h2>
                <p className="text-zinc-400 text-xs mt-1">Configure los bienes afectados comercialmente, cuentas bancarias, activos de uso particular y pasivos personales para la Justificación Patrimonial Anual.</p>
              </div>

              {/* SECCIÓN 1: BIENES DE USO (ACTIVOS FIJOS Afectados al negocio) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Bienes de Uso Afectados (Activos Fijos)</h3>
                  <span className="text-[10px] text-zinc-450 italic">Generan amortizaciones deducibles comercialmente</span>
                </div>

                <div className="border border-zinc-800 rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Nombre del Bien</th>
                        <th className="px-4 py-3 text-center">Tipo</th>
                        <th className="px-4 py-3 text-center">Fecha Compra</th>
                        <th className="px-4 py-3 text-right">Valor Origen ($)</th>
                        <th className="px-4 py-3 text-center">Vida Útil (Años)</th>
                        <th className="px-4 py-3 text-center">Años al Cierre</th>
                        <th className="px-4 py-3 text-right">Coef. Reexp.</th>
                        <th className="px-4 py-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50">
                      {fixedAssets.map((asset, index) => (
                        <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                          <td className="px-4 py-2">
                            <input 
                              type="text"
                              id={`assets-name-${index}`}
                              value={asset.name || ''}
                              onChange={(e) => handleCellChange(index, 'name', e.target.value, 'assets')}
                              onKeyDown={(e) => handleAssetsKeyDown(e, index, 'name')}
                              className="bg-transparent border-0 text-white text-xs focus:ring-0 focus:outline-none w-full"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <select
                              value={asset.type || 'Otro'}
                              onChange={(e) => handleCellChange(index, 'type', e.target.value, 'assets')}
                              className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                            >
                              <option value="Rodado">Rodado (5 años)</option>
                              <option value="Inmueble">Inmueble (50 años)</option>
                              <option value="Equipamiento">Equipamiento (10 años)</option>
                              <option value="Otro">Otro</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="date"
                              value={asset.purchaseDate ?? ''}
                              onChange={(e) => handleCellChange(index, 'purchaseDate', e.target.value, 'assets')}
                              className="bg-transparent border-0 text-zinc-300 text-xs font-mono focus:ring-0 focus:outline-none w-32 text-center focus:border-b focus:border-teal-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              id={`assets-cost-${index}`}
                              value={asset.originalCost ?? ''}
                              onChange={(e) => handleCellChange(index, 'originalCost', e.target.value, 'assets')}
                              onKeyDown={(e) => handleAssetsKeyDown(e, index, 'cost')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input 
                              type="number"
                              value={asset.usefulLife ?? ''}
                              onChange={(e) => handleCellChange(index, 'usefulLife', e.target.value, 'assets')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-16 text-center focus:border-b focus:border-teal-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input 
                              type="number"
                              value={asset.yearsElapsed ?? ''}
                              onChange={(e) => handleCellChange(index, 'yearsElapsed', e.target.value, 'assets')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-16 text-center focus:border-b focus:border-teal-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="text"
                              value={asset.customReexpIndex ?? ''}
                              onChange={(e) => handleCellChange(index, 'customReexpIndex', e.target.value, 'assets')}
                              className="bg-transparent border-0 text-teal-400 text-xs font-mono focus:ring-0 focus:outline-none w-20 text-right"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button 
                              onClick={() => deleteRow(index, 'assets')}
                              className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {fixedAssets.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                            Sin bienes de uso declarados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={() => addRow('assets')}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3.5]" />
                  Añadir Bien de Uso
                </button>
              </div>

              {/* SECCIÓN 2: DISPONIBILIDADES (BANCOS) */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <div>
                  <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Disponibilidades y Saldos Bancarios</h3>
                  <p className="text-zinc-400 text-[11px] mt-1">Declare las cuentas bancarias del negocio impositivo y sus respectivos saldos al inicio y al cierre.</p>
                </div>

                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Entidad Financiera</th>
                        <th className="px-4 py-3">N° Cuenta</th>
                        <th className="px-4 py-3 text-center">Moneda</th>
                        <th className="px-4 py-3 text-right">Saldo Inicial</th>
                        <th className="px-4 py-3 text-right">Saldo Cierre</th>
                        <th className="px-4 py-3 text-right">Intereses ($)</th>
                        <th className="px-4 py-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50">
                      {bankAccounts.map((bank, index) => (
                        <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                          <td className="px-4 py-2">
                            <input 
                              type="text"
                              value={bank.name || ''}
                              onChange={(e) => handleCellChange(index, 'name', e.target.value, 'bankAccounts')}
                              className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold"
                              placeholder="Nombre del Banco"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="text"
                              value={bank.accountNumber || ''}
                              onChange={(e) => handleCellChange(index, 'accountNumber', e.target.value, 'bankAccounts')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full"
                              placeholder="Nº de Cuenta"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <select
                              value={bank.currency || 'ARS'}
                              onChange={(e) => handleCellChange(index, 'currency', e.target.value, 'bankAccounts')}
                              className="bg-zinc-900 text-white text-xs font-bold rounded border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-teal-500 py-1 px-2 cursor-pointer"
                            >
                              <option value="ARS">ARS</option>
                              <option value="USD">USD</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="space-y-1.5">
                              <input 
                                type="number"
                                value={bank.nominalInitial ?? ''}
                                onChange={(e) => handleCellChange(index, 'nominalInitial', e.target.value, 'bankAccounts')}
                                className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right"
                              />
                              {bank.currency === 'USD' && (
                                <div className="flex flex-col items-end space-y-1">
                                  <div className="flex items-center gap-1 text-[9px] text-zinc-500">
                                    <span>TC Inicial:</span>
                                    <input 
                                      type="number" 
                                      step="0.01"
                                      value={bank.tcInitial ?? '1'}
                                      onChange={(e) => handleCellChange(index, 'tcInitial', e.target.value, 'bankAccounts')}
                                      className="bg-[#09090b] border border-zinc-800 text-white text-[9px] font-mono rounded w-16 text-right px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-teal-400 font-mono">
                                    ${(wizardMoneyToNumber(bank.nominalInitial) * wizardMoneyToNumber(bank.tcInitial, 1)).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="space-y-1.5">
                              <input 
                                type="number"
                                value={bank.nominalFinal ?? ''}
                                onChange={(e) => handleCellChange(index, 'nominalFinal', e.target.value, 'bankAccounts')}
                                className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                              />
                              {bank.currency === 'USD' && (
                                <div className="flex flex-col items-end space-y-1">
                                  <div className="flex items-center gap-1 text-[9px] text-zinc-500">
                                    <span>TC Cierre:</span>
                                    <input 
                                      type="number" 
                                      step="0.01"
                                      value={bank.tcFinal ?? '1'}
                                      onChange={(e) => handleCellChange(index, 'tcFinal', e.target.value, 'bankAccounts')}
                                      className="bg-[#09090b] border border-zinc-800 text-white text-[9px] font-mono rounded w-16 text-right px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-teal-400 font-mono">
                                    ${(wizardMoneyToNumber(bank.nominalFinal) * wizardMoneyToNumber(bank.tcFinal, 1)).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              value={bank.interests ?? ''}
                              onChange={(e) => handleCellChange(index, 'interests', e.target.value, 'bankAccounts')}
                              className="bg-transparent border-0 text-teal-400 text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button 
                              onClick={() => deleteRow(index, 'bankAccounts')}
                              className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {bankAccounts.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                            Sin cuentas bancarias declaradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={() => addRow('bankAccounts')}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3.5]" />
                  Añadir Cuenta Bancaria
                </button>
              </div>

              {/* SECCIÓN 2B: AUXILIARES ESP */}
              <details className="pt-6 border-t border-zinc-800 group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-[#09090b]/70 px-4 py-3 transition-colors hover:border-teal-500/40">
                  <div>
                    <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Auxiliares ESP: efectivo, creditos y pasivos</h3>
                    <p className="text-zinc-400 text-[11px] mt-1">
                      Carga agregada para controlar las hojas `Efectivo`, `Creditos` y `Pasivo`. Sirve como respaldo operativo; el patrimonio comercial agregado sigue cargandose en Paso 1.
                    </p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold group-open:text-teal-300">
                    Abrir / cerrar
                  </span>
                </summary>

                <div className="mt-4 space-y-6 rounded-xl border border-zinc-850 bg-[#09090b]/35 p-4">
                  {(() => {
                    const cashInitial = cashHoldings.reduce((sum, cash) => sum.add(new Decimal(cash.nominalInitial || 0).mul(new Decimal(cash.tcFinal || 1))), new Decimal(0));
                    const cashFinal = cashHoldings.reduce((sum, cash) => sum.add(new Decimal(cash.nominalFinal || 0).mul(new Decimal(cash.tcFinal || 1))), new Decimal(0));
                    const receivablesInitial = receivables.reduce((sum, item) => sum.add(new Decimal(item.balanceInitial || 0)), new Decimal(0));
                    const receivablesFinal = receivables.reduce((sum, item) => sum.add(new Decimal(item.balanceFinal || 0)), new Decimal(0));
                    const liabilitiesInitial = liabilities.reduce((sum, item) => sum.add(new Decimal(item.balanceInitial || 0)), new Decimal(0));
                    const liabilitiesFinal = liabilities.reduce((sum, item) => sum.add(new Decimal(item.balanceFinal || 0)), new Decimal(0));
                    const espAssetsInitial = cashInitial.add(receivablesInitial);
                    const espAssetsFinal = cashFinal.add(receivablesFinal);
                    const espNetInitial = espAssetsInitial.sub(liabilitiesInitial);
                    const espNetFinal = espAssetsFinal.sub(liabilitiesFinal);

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-zinc-800 bg-[#09090b]/80 px-3 py-2">
                          <span className="block text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Activo aux. inicio</span>
                          <span className="block text-xs font-mono text-zinc-200">{formatDecimal(espAssetsInitial)}</span>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-[#09090b]/80 px-3 py-2">
                          <span className="block text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Activo aux. cierre</span>
                          <span className="block text-xs font-mono text-zinc-200">{formatDecimal(espAssetsFinal)}</span>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-[#09090b]/80 px-3 py-2">
                          <span className="block text-[9px] uppercase tracking-wider text-zinc-500 font-bold">PN aux. inicio</span>
                          <span className="block text-xs font-mono text-teal-300">{formatDecimal(espNetInitial)}</span>
                        </div>
                        <div className="rounded-lg border border-zinc-800 bg-[#09090b]/80 px-3 py-2">
                          <span className="block text-[9px] uppercase tracking-wider text-zinc-500 font-bold">PN aux. cierre</span>
                          <span className="block text-xs font-mono text-teal-300">{formatDecimal(espNetFinal)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[11px] text-amber-100/80">
                    Estos saldos quedan guardados y reabren con la DDJJ. Para que impacten AXI/JVP automaticamente falta el proximo corte de integracion con `activoTotalInicio`, `pasivoTotalInicio` y ESP.
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-extrabold text-zinc-200 uppercase tracking-wider">Efectivo</h4>
                      <button
                        onClick={() => addRow('cashHoldings')}
                        className="flex items-center gap-1.5 text-[10px] text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[3.5]" />
                        Añadir efectivo
                      </button>
                    </div>
                    <div className="border border-zinc-800 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                            <th className="px-4 py-3 text-center">Moneda</th>
                            <th className="px-4 py-3 text-right">Nominal inicial</th>
                            <th className="px-4 py-3 text-right">Nominal cierre</th>
                            <th className="px-4 py-3 text-right">TC cierre</th>
                            <th className="px-4 py-3 text-right">Eliminar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850/50">
                          {cashHoldings.map((cash, index) => (
                            <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                              <td className="px-4 py-2 text-center">
                                <select
                                  value={cash.currency || 'ARS'}
                                  onChange={(e) => handleCellChange(index, 'currency', e.target.value, 'cashHoldings')}
                                  className="bg-zinc-900 text-white text-xs font-bold rounded border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-teal-500 py-1 px-2 cursor-pointer"
                                >
                                  <option value="ARS">ARS</option>
                                  <option value="USD">USD</option>
                                </select>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input type="number" value={cash.nominalInitial ?? ''} onChange={(e) => handleCellChange(index, 'nominalInitial', e.target.value, 'cashHoldings')} className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right" />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input type="number" value={cash.nominalFinal ?? ''} onChange={(e) => handleCellChange(index, 'nominalFinal', e.target.value, 'cashHoldings')} className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold" />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <input type="number" step="0.01" value={cash.tcFinal ?? '1'} onChange={(e) => handleCellChange(index, 'tcFinal', e.target.value, 'cashHoldings')} className="bg-transparent border-0 text-teal-300 text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold" />
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button onClick={() => deleteRow(index, 'cashHoldings')} className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {cashHoldings.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                                Sin efectivo auxiliar cargado.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-extrabold text-zinc-200 uppercase tracking-wider">Creditos</h4>
                        <button onClick={() => addRow('receivables')} className="flex items-center gap-1.5 text-[10px] text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer">
                          <Plus className="h-3.5 w-3.5 stroke-[3.5]" />
                          Añadir credito
                        </button>
                      </div>
                      <div className="border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                              <th className="px-4 py-3">Concepto</th>
                              <th className="px-4 py-3 text-center">Tipo</th>
                              <th className="px-4 py-3 text-right">Inicial</th>
                              <th className="px-4 py-3 text-right">Cierre</th>
                              <th className="px-4 py-3 text-right">Eliminar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-850/50">
                            {receivables.map((receivable, index) => (
                              <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                                <td className="px-4 py-2">
                                  <input type="text" value={receivable.description || ''} onChange={(e) => handleCellChange(index, 'description', e.target.value, 'receivables')} className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold" placeholder="IVA saldo tecnico, clientes..." />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <select value={receivable.type || 'Comercial'} onChange={(e) => handleCellChange(index, 'type', e.target.value, 'receivables')} className="bg-zinc-900 text-white text-xs rounded border border-zinc-800 py-1 px-2 focus:outline-none">
                                    <option value="Comercial">Comercial</option>
                                    <option value="Fiscal">Fiscal</option>
                                    <option value="Financiero">Financiero</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input type="number" value={receivable.balanceInitial ?? ''} onChange={(e) => handleCellChange(index, 'balanceInitial', e.target.value, 'receivables')} className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right" />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input type="number" value={receivable.balanceFinal ?? ''} onChange={(e) => handleCellChange(index, 'balanceFinal', e.target.value, 'receivables')} className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold" />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button onClick={() => deleteRow(index, 'receivables')} className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {receivables.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                                  Sin creditos auxiliares cargados.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-extrabold text-zinc-200 uppercase tracking-wider">Pasivos comerciales</h4>
                        <button onClick={() => addRow('liabilities')} className="flex items-center gap-1.5 text-[10px] text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer">
                          <Plus className="h-3.5 w-3.5 stroke-[3.5]" />
                          Añadir pasivo
                        </button>
                      </div>
                      <div className="border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                              <th className="px-4 py-3">Concepto</th>
                              <th className="px-4 py-3 text-center">Tipo</th>
                              <th className="px-4 py-3 text-right">Inicial</th>
                              <th className="px-4 py-3 text-right">Cierre</th>
                              <th className="px-4 py-3 text-right">Eliminar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-850/50">
                            {liabilities.map((liability, index) => (
                              <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                                <td className="px-4 py-2">
                                  <input type="text" value={liability.description || ''} onChange={(e) => handleCellChange(index, 'description', e.target.value, 'liabilities')} className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold" placeholder="Proveedores, otros pasivos..." />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <select value={liability.type || 'Otros'} onChange={(e) => handleCellChange(index, 'type', e.target.value, 'liabilities')} className="bg-zinc-900 text-white text-xs rounded border border-zinc-800 py-1 px-2 focus:outline-none">
                                    <option value="Proveedores">Proveedores</option>
                                    <option value="Otros">Otros</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input type="number" value={liability.balanceInitial ?? ''} onChange={(e) => handleCellChange(index, 'balanceInitial', e.target.value, 'liabilities')} className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right" />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input type="number" value={liability.balanceFinal ?? ''} onChange={(e) => handleCellChange(index, 'balanceFinal', e.target.value, 'liabilities')} className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold" />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button onClick={() => deleteRow(index, 'liabilities')} className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {liabilities.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                                  Sin pasivos comerciales auxiliares cargados.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              {/* SECCIÓN 3: BIENES Y ACTIVOS PERSONALES */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <div>
                  <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Activos y Bienes Personales (No afectados al negocio)</h3>
                  <p className="text-zinc-400 text-[11px] mt-1">Declare sus bienes de uso particular (ej: automóvil personal, casa de habitación, fondos personales). Estos bienes <strong>no generan deducciones</strong> en la liquidación comercial, pero son <strong>esenciales</strong> para conciliar el Consumo en la Variación Patrimonial Anual.</p>
                </div>

                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Descripción del Bien Personal</th>
                        <th className="px-4 py-3 text-center">Tipo de Activo</th>
                        <th className="px-4 py-3 text-right">Valor Inicial ($)</th>
                        <th className="px-4 py-3 text-right">Valor Cierre ($)</th>
                        <th className="px-4 py-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50">
                      {personalAssets.map((asset, index) => (
                        <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                          <td className="px-4 py-2">
                            <input 
                              type="text"
                              value={asset.description || ''}
                              onChange={(e) => handleCellChange(index, 'description', e.target.value, 'personalAssets')}
                              className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold"
                              placeholder="Ej: Automóvil Particular Ford Focus, Casa Habitación..."
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <select
                              value={asset.type || 'Otros'}
                              onChange={(e) => handleCellChange(index, 'type', e.target.value, 'personalAssets')}
                              className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                            >
                              <option value="Vehiculo">Automóvil / Vehículo Particular</option>
                              <option value="Inmueble">Inmueble Particular / Vivienda</option>
                              <option value="Efectivo">Tenencia de Dinero en Efectivo</option>
                              <option value="Otros">Otros Bienes / Créditos Personales</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              value={asset.valueInitial ?? ''}
                              onChange={(e) => handleCellChange(index, 'valueInitial', e.target.value, 'personalAssets')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              value={asset.valueFinal ?? ''}
                              onChange={(e) => handleCellChange(index, 'valueFinal', e.target.value, 'personalAssets')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button 
                              onClick={() => deleteRow(index, 'personalAssets')}
                              className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {personalAssets.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                            Sin bienes personales declarados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={() => addRow('personalAssets')}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3.5]" />
                  Añadir Activo / Bien Personal
                </button>
              </div>

              {/* SECCIÓN 4: DEUDAS Y PASIVOS PERSONALES */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <div>
                  <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Pasivos y Deudas Personales</h3>
                  <p className="text-zinc-400 text-[11px] mt-1">Declare las deudas personales al inicio y cierre para balancear la Justificación Patrimonial.</p>
                </div>

                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Descripción de la Deuda / Acreedor</th>
                        <th className="px-4 py-3 text-right">Saldo Inicial ($)</th>
                        <th className="px-4 py-3 text-right">Saldo Cierre ($)</th>
                        <th className="px-4 py-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50">
                      {personalLiabilities.map((liab, index) => (
                        <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                          <td className="px-4 py-2">
                            <input 
                              type="text"
                              value={liab.description || ''}
                              onChange={(e) => handleCellChange(index, 'description', e.target.value, 'personalLiabilities')}
                              className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold"
                              placeholder="Ej: Préstamo Banco Nación, Acreedor Hipotecario..."
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              value={liab.valueInitial ?? ''}
                              onChange={(e) => handleCellChange(index, 'valueInitial', e.target.value, 'personalLiabilities')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              value={liab.valueFinal ?? ''}
                              onChange={(e) => handleCellChange(index, 'valueFinal', e.target.value, 'personalLiabilities')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button 
                              onClick={() => deleteRow(index, 'personalLiabilities')}
                              className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {personalLiabilities.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                            Sin pasivos ni deudas declaradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={() => addRow('personalLiabilities')}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3.5]" />
                  Añadir Pasivo / Deuda
                </button>
              </div>

              {/* SECCIÓN 5: OTRAS JUSTIFICACIONES PATRIMONIALES */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                {(() => {
                  const columnOneTotal = otherJustifications
                    .filter(item => item.column === 1)
                    .reduce((sum, item) => sum.add(new Decimal(item.amount || 0)), new Decimal(0));
                  const columnTwoTotal = otherJustifications
                    .filter(item => item.column !== 1)
                    .reduce((sum, item) => sum.add(new Decimal(item.amount || 0)), new Decimal(0));

                  return (
                    <>
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Otras Justificaciones Patrimoniales</h3>
                          <p className="text-zinc-400 text-[11px] mt-1">
                            Cargue conceptos que explican la variación patrimonial y no surgen de activos, pasivos o bancos. Use columna I para erogaciones/PN final y columna II para conceptos que justifican recursos/PN inicial.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 min-w-64">
                          <div className="rounded-lg border border-zinc-800 bg-[#09090b]/70 px-3 py-2">
                            <span className="block text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Columna I</span>
                            <span className="block text-xs font-mono text-amber-300">{formatDecimal(columnOneTotal)}</span>
                          </div>
                          <div className="rounded-lg border border-zinc-800 bg-[#09090b]/70 px-3 py-2">
                            <span className="block text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Columna II</span>
                            <span className="block text-xs font-mono text-emerald-300">{formatDecimal(columnTwoTotal)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-[#09090b]/45 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mr-1">
                            Presets rápidos:
                          </span>
                          {WIZARD_OTHER_JUSTIFICATION_PRESETS.map(preset => (
                            <button
                              key={preset.key}
                              onClick={() => addOtherJustificationPreset(preset.key)}
                              className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:border-teal-500/60 hover:text-teal-300 hover:bg-teal-500/5 transition-colors"
                              title={`${preset.concept} - Columna ${preset.column === 1 ? 'I' : 'II'}`}
                            >
                              {preset.label} · Col {preset.column === 1 ? 'I' : 'II'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                              <th className="px-4 py-3">Concepto</th>
                              <th className="px-4 py-3 text-center">Columna JVP</th>
                              <th className="px-4 py-3 text-right">Importe ($)</th>
                              <th className="px-4 py-3 text-right">Eliminar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-850/50">
                            {otherJustifications.map((justification, index) => (
                              <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                                <td className="px-4 py-2">
                                  <input
                                    type="text"
                                    value={justification.concept || ''}
                                    onChange={(e) => handleCellChange(index, 'concept', e.target.value, 'otherJustifications')}
                                    className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold"
                                    placeholder="Ej: Herencia recibida, donación, gasto no deducible..."
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <select
                                    value={justification.column ?? 2}
                                    onChange={(e) => handleCellChange(index, 'column', e.target.value, 'otherJustifications')}
                                    className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none"
                                  >
                                    <option value={1}>Columna I - Erogaciones / PN final</option>
                                    <option value={2}>Columna II - Justifica / PN inicial</option>
                                  </select>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input
                                    type="number"
                                    value={justification.amount ?? ''}
                                    onChange={(e) => handleCellChange(index, 'amount', e.target.value, 'otherJustifications')}
                                    className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                                  />
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <button
                                    onClick={() => deleteRow(index, 'otherJustifications')}
                                    className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {otherJustifications.length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                                  Sin otras justificaciones patrimoniales. Agregue solo los conceptos necesarios para explicar el consumo.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <button
                        onClick={() => addRow('otherJustifications')}
                        className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer"
                      >
                        <Plus className="h-4 w-4 stroke-[3.5]" />
                        Añadir Justificación JVP
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* PILAR 4: PRE-CONCILIACIÓN PATRIMONIAL EN PASO 4 */}
              {(() => {
                const banksIni = bankAccounts.reduce((sum, b) => sum.add(new Decimal(b.nominalInitial || 0).mul(new Decimal(b.tcInitial || 1))), new Decimal(0));
                const banksFin = bankAccounts.reduce((sum, b) => sum.add(new Decimal(b.nominalFinal || 0).mul(new Decimal(b.tcFinal || 1))), new Decimal(0));
                
                const assetsIni = personalAssets.reduce((sum, a) => sum.add(new Decimal(a.valueInitial || 0)), new Decimal(0));
                const assetsFin = personalAssets.reduce((sum, a) => sum.add(new Decimal(a.valueFinal || 0)), new Decimal(0));
                
                const liabIni = personalLiabilities.reduce((sum, l) => sum.add(new Decimal(l.valueInitial || 0)), new Decimal(0));
                const liabFin = personalLiabilities.reduce((sum, l) => sum.add(new Decimal(l.valueFinal || 0)), new Decimal(0));
                
                const totalIni = banksIni.add(assetsIni).sub(liabIni)
                  .add(new Decimal(activoTotalInicio || 0).sub(new Decimal(pasivoTotalInicio || 0)));
                const totalFin = banksFin.add(assetsFin).sub(liabFin)
                  .add(new Decimal(activoTotalInicio || 0).sub(new Decimal(pasivoTotalInicio || 0))
                    .add(calculationResult ? calculationResult.resultadoComercialNeto.toNumber() : 0));
                const variacion = totalFin.sub(totalIni);
                const hasValues = totalIni.abs().gt(0) || totalFin.abs().gt(0);
                
                if (!hasValues) return null;
                
                return (
                  <div className="mt-8 p-5 rounded-xl bg-gradient-to-br from-[#181820] to-[#121216] border border-zinc-800 shadow-xl space-y-4 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-teal-500/10 flex items-center justify-center text-teal-400">
                        <DollarSign className="h-3.5 w-3.5" />
                      </div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">Pre-Conciliación Patrimonial (Variación Neta)</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                      <div className="p-3.5 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                        <span className="text-[10px] uppercase font-bold text-zinc-550 block mb-1">Patrimonio Neto Inicial</span>
                        <span className="text-base font-bold text-zinc-200">{formatDecimal(totalIni)}</span>
                      </div>
                      <div className="p-3.5 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                        <span className="text-[10px] uppercase font-bold text-zinc-550 block mb-1">Patrimonio Neto Cierre</span>
                        <span className="text-base font-bold text-zinc-200">{formatDecimal(totalFin)}</span>
                      </div>
                      <div className={`p-3.5 rounded-lg bg-[#09090b]/80 border ${variacion.toNumber() >= 0 ? 'border-emerald-500/20' : 'border-amber-500/20'}`}>
                        <span className="text-[10px] uppercase font-bold text-zinc-550 block mb-1">Variación Neta Ejercicio</span>
                        <span className={`text-base font-extrabold block ${variacion.toNumber() >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {formatDecimal(variacion)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* PASO 5: DEDUCCIONES Y AJUSTES */}
          {currentStep === 5 && (
            <div className="space-y-8 animate-fadeIn">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Paso 5: Deducciones Generales, Retenciones y Ajustes</h2>
                <p className="text-zinc-400 text-xs mt-1">Configure las deducciones generales admitidas por ley, las retenciones sufridas y los saldos anteriores o variaciones AXI.</p>
              </div>

              {/* SECCIÓN 1: DEDUCCIONES GENERALES */}
              {(() => {
                const getTope = (key: string, def: string) => {
                  if (activeParams?.parameterSet && activeParams.parameterSet[key] !== undefined) {
                    return formatCurrencyCents(activeParams.parameterSet[key]);
                  }
                  return def;
                };

                const hasSecondaryDeductionsValue = 
                  (generalDeductions.servicioDomestico && generalDeductions.servicioDomestico !== '0') ||
                  (generalDeductions.seguroVida && generalDeductions.seguroVida !== '0') ||
                  (generalDeductions.seguroRetiro && generalDeductions.seguroRetiro !== '0') ||
                  (generalDeductions.gastosSepelio && generalDeductions.gastosSepelio !== '0') ||
                  (generalDeductions.interesesHipoteca && generalDeductions.interesesHipoteca !== '0') ||
                  (generalDeductions.alquilerCasaHabitacion && generalDeductions.alquilerCasaHabitacion !== '0') ||
                  (generalDeductions.deduccionLocadorLocatario && generalDeductions.deduccionLocadorLocatario !== '0') ||
                  (generalDeductions.donaciones && generalDeductions.donaciones !== '0') ||
                  (generalDeductions.honorariosMedicos && generalDeductions.honorariosMedicos !== '0');

                const showSecondary = showAllDeductions || hasSecondaryDeductionsValue;

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Deducciones Generales Admitidas (Art. 85 / 86)</h3>
                      <span className="text-[10px] text-zinc-450 italic">Erogaciones justificadas deducibles</span>
                    </div>

                    <div className="p-5 rounded-xl bg-[#09090b] border border-zinc-850 space-y-6">
                      {/* Deducciones Principales */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs uppercase font-bold text-zinc-450 tracking-wider block">Aportes Autónomos</label>
                          <input 
                            type="number"
                            value={generalDeductions.autonomos ?? ''}
                            onChange={(e) => setGeneralDeductions({...generalDeductions, autonomos: e.target.value})}
                            className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs uppercase font-bold text-zinc-450 tracking-wider block">Prepagas / Asistencial (Tope: 5% Gan. Neta)</label>
                          <input 
                            type="number"
                            value={generalDeductions.medicosAsistencial ?? ''}
                            onChange={(e) => setGeneralDeductions({...generalDeductions, medicosAsistencial: e.target.value})}
                            className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs uppercase font-bold text-zinc-450 tracking-wider block">Gastos Educativos (Tope: {getTope('topeGastosEducativos', '$1.803.002,21')})</label>
                          <input 
                            type="number"
                            value={generalDeductions.gastosEducativos ?? ''}
                            onChange={(e) => setGeneralDeductions({...generalDeductions, gastosEducativos: e.target.value})}
                            className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                          />
                        </div>
                      </div>

                      {/* Botón Acordeón / Colapsable */}
                      <div className="flex justify-center border-t border-zinc-850/50 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowAllDeductions(!showAllDeductions)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-900 border border-zinc-800 hover:border-teal-500/30 text-xs font-bold text-teal-400 uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          {showSecondary ? 'Ocultar Deducciones Adicionales' : 'Mostrar Todas las Deducciones Generales (Serv. Doméstico, Seguros, Alquileres, Donaciones...)'}
                        </button>
                      </div>

                      {/* Deducciones Adicionales (Collapsible) */}
                      {showSecondary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-zinc-850/50 pt-6 animate-fadeIn">
                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Servicio Doméstico (Tope: {getTope('topeServicioDomestico', '$4.507.505,52')})</label>
                            <input 
                              type="number"
                              value={generalDeductions.servicioDomestico ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, servicioDomestico: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Seguro de Vida (Tope: {getTope('topeSeguroVida', '$573.817,13')})</label>
                            <input 
                              type="number"
                              value={generalDeductions.seguroVida ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, seguroVida: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Seguro de Retiro (Tope: {getTope('topeSeguroRetiro', '$573.817,13')})</label>
                            <input 
                              type="number"
                              value={generalDeductions.seguroRetiro ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, seguroRetiro: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Gastos de Sepelio (Tope: {getTope('topeGastosSepelio', '$996,23')})</label>
                            <input 
                              type="number"
                              value={generalDeductions.gastosSepelio ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, gastosSepelio: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Intereses Créditos Hipotecarios (Tope: {getTope('topeInteresHipoteca', '$20.000,00')})</label>
                            <input 
                              type="number"
                              value={generalDeductions.interesesHipoteca ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, interesesHipoteca: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Alquiler Casa Habitación (Deducible: 40%)</label>
                            <input 
                              type="number"
                              value={generalDeductions.alquilerCasaHabitacion ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, alquilerCasaHabitacion: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Locador / Locatario (Deducible: 10%)</label>
                            <input
                              type="number"
                              value={generalDeductions.deduccionLocadorLocatario ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, deduccionLocadorLocatario: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Donaciones (Tope: 5% Ganancia Neta)</label>
                            <input 
                              type="number"
                              value={generalDeductions.donaciones ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, donaciones: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500 tracking-wider block">Honorarios Médicos Facturados (Deducible: 40%)</label>
                            <input 
                              type="number"
                              value={generalDeductions.honorariosMedicos ?? ''}
                              onChange={(e) => setGeneralDeductions({...generalDeductions, honorariosMedicos: e.target.value})}
                              className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* SECCIÓN 2: RETENCIONES Y PAGOS A CUENTA */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Retenciones, Percepciones y Pagos a Cuenta</h3>
                    <p className="text-zinc-400 text-[11px] mt-1">Cargue los pagos a cuenta computables. Puede subir el Excel de AFIP (Mis Retenciones).</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {withholdings.length > 0 && (
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/25 font-mono">
                        <div className="text-left">
                          <span className="text-[9px] uppercase tracking-wider text-teal-400 block font-bold">Total Retenciones</span>
                          <span className="text-sm font-bold text-teal-300">
                            ${withholdings.reduce((sum, w) => sum.add(new Decimal(w.amount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="h-6 w-[1px] bg-teal-500/20"></div>
                        <div className="text-left text-[10px] text-zinc-400">
                          <span className="block font-semibold">Ganancias: <span className="text-zinc-200">${withholdings.filter(w => w.taxCode === 'Ganancias').reduce((sum, w) => sum.add(new Decimal(w.amount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                          <span className="block font-semibold">Otros: <span className="text-zinc-200">${withholdings.filter(w => w.taxCode !== 'Ganancias').reduce((sum, w) => sum.add(new Decimal(w.amount || 0)), new Decimal(0)).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => handleFileUpload(e, 'withholdings')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={isUploading}
                      />
                      <button className="flex items-center gap-2 h-9 px-4 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs transition-colors cursor-pointer">
                        <Upload className="h-4 w-4" />
                        {isUploading ? 'Procesando...' : 'Importar Excel AFIP'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Concepto / Impuesto</th>
                        <th className="px-4 py-3 text-right">Importe Retenido ($)</th>
                        <th className="px-4 py-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50">
                      {withholdings.map((withholding, index) => (
                        <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                          <td className="px-4 py-2">
                            <select
                              value={withholding.taxCode}
                              onChange={(e) => handleCellChange(index, 'taxCode', e.target.value, 'withholdings')}
                              className="bg-[#09090b] border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-300 focus:outline-none w-full"
                            >
                              <option value="Ganancias">Impuesto a las Ganancias (Cómputo en cabecera)</option>
                              <option value="Otros">Otros Impuestos</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input 
                              type="number"
                              value={withholding.amount ?? ''}
                              onChange={(e) => handleCellChange(index, 'amount', e.target.value, 'withholdings')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button 
                              onClick={() => deleteRow(index, 'withholdings')}
                              className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {withholdings.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                            Sin retenciones ni percepciones declaradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  type="button"
                  onClick={() => addRow('withholdings')}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider focus:outline-none cursor-pointer"
                >
                  <Plus className="h-4 w-4 stroke-[3.5]" />
                  Añadir Retención
                </button>
              </div>

              {/* SECCIÓN 3: CRÉDITOS Y QUEBRANTOS */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Créditos y Quebrantos de Ejercicios Anteriores</h3>
                <p className="text-zinc-400 text-[11px] leading-relaxed">Cargue los saldos a favor impositivos del ejercicio anterior y los quebrantos de años anteriores acumulados para compensar en el ejercicio actual.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#09090b] p-5 rounded-lg border border-zinc-850">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block">Saldo a Favor del Período Anterior ($)</label>
                    <input 
                      type="number"
                      value={saldoAFavorAnterior ?? ''}
                      onChange={(e) => setSaldoAFavorAnterior(e.target.value)}
                      className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      placeholder="Ej: 0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block">Quebrantos de Períodos Anteriores a Compensar ($)</label>
                    <input 
                      type="number"
                      value={quebrantosAnteriores ?? ''}
                      onChange={(e) => setQuebrantosAnteriores(e.target.value)}
                      className="w-full h-11 px-4 rounded-lg bg-[#121216] border border-zinc-800 text-sm text-white focus:outline-none focus:border-teal-500/50 transition-colors font-mono"
                      placeholder="Ej: 0.00"
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN 4: AJUSTE POR INFLACIÓN DINÁMICO (AXI) */}
              <div className="pt-6 border-t border-zinc-800 space-y-4">
                <h3 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider">Ajuste por Inflación Dinámico (Variaciones)</h3>
                <p className="text-zinc-400 text-[11px] leading-relaxed">Cargue los movimientos que modificaron el capital computable del negocio durante el año (ej: aportes de capital, retiros de socios). El sistema calculará el ajuste por inflación ponderado correspondiente.</p>
                
                <div className="border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/10 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Concepto / Descripción</th>
                        <th className="px-4 py-3 text-center">Tipo de Movimiento</th>
                        <th className="px-4 py-3 text-right">Monto ($)</th>
                        <th className="px-4 py-3 text-right">Coef.</th>
                        <th className="px-4 py-3 text-right">Ajuste</th>
                        <th className="px-4 py-3 text-right">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50">
                      {axiDynamic.map((item, index) => (
                        <tr key={index} className="hover:bg-zinc-800/10 animate-fadeIn">
                          <td className="px-4 py-2 w-40">
                            <input 
                              type="date"
                              value={item.date || ''}
                              onChange={(e) => handleCellChange(index, 'date', e.target.value, 'axiDynamic')}
                              className="bg-[#09090b] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-350 focus:outline-none w-full"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="text"
                              value={item.concept || ''}
                              onChange={(e) => handleCellChange(index, 'concept', e.target.value, 'axiDynamic')}
                              className="bg-transparent border-0 text-white text-xs font-sans focus:ring-0 focus:outline-none w-full font-bold"
                              placeholder="Ej: Aporte Socio X, Retiro de Efectivo..."
                            />
                          </td>
                          <td className="px-4 py-2 text-center w-48">
                            <select
                              value={item.type || 'RetiroSocio'}
                              onChange={(e) => handleCellChange(index, 'type', e.target.value, 'axiDynamic')}
                              className="bg-zinc-900 text-white text-xs font-bold rounded border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-teal-500 py-1 px-2 cursor-pointer w-full"
                            >
                              <option value="RetiroSocio">Retiro de Socios / Dividendo</option>
                              <option value="AporteCapital">Aporte de Capital</option>
                              <option value="Otro">Otro Ajuste Dinámico</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right w-40">
                            <input 
                              type="number"
                              value={item.amount ?? ''}
                              onChange={(e) => handleCellChange(index, 'amount', e.target.value, 'axiDynamic')}
                              className="bg-transparent border-0 text-white text-xs font-mono focus:ring-0 focus:outline-none w-full text-right font-bold"
                            />
                          </td>
                          <td className="px-4 py-2 text-right w-28 text-[11px] font-mono text-zinc-350">
                            {item.coef !== undefined && item.coef !== ''
                              ? Number(item.coef).toLocaleString('es-AR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
                              : 'Al guardar'}
                          </td>
                          <td className="px-4 py-2 text-right w-32 text-[11px] font-mono text-zinc-350">
                            {item.computedAxi !== undefined && item.computedAxi !== ''
                              ? formatDecimal(item.computedAxi)
                              : 'Al guardar'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button 
                              onClick={() => deleteRow(index, 'axiDynamic')}
                              className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {axiDynamic.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 text-center text-xs text-zinc-500 italic">
                            Sin variaciones del capital computable declaradas para el AXI dinámico.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={() => addRow('axiDynamic')}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold uppercase tracking-wider cursor-pointer mt-2"
                >
                  <Plus className="h-4 w-4 stroke-[3.5]" />
                  Añadir Movimiento AXI
                </button>
              </div>
            </div>
          )}

          {/* PASO 6: CIERRE Y CONSOLIDACIÓN (CALCULATION MOTOR RESULTS) */}
          {currentStep === 6 && calculationResult && (
            <div className="space-y-8">
              
              {/* CABECERA DE RESULTADOS */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-dashed border-zinc-800 pb-6">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Paso 6: Consolidación y Determinación Impositiva</h2>
                  <p className="text-zinc-400 text-xs mt-1">Los datos se han procesado de forma exitosa en el motor de cálculo. Verifique las determinaciones.</p>
                  <div
                    className={`mt-3 inline-flex max-w-xl items-start gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${previewStatusClasses}`}
                    title={previewStatus.detail}
                  >
                    <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${previewStatusDotClasses}`} />
                    <span>
                      <span className="block uppercase tracking-[0.16em]">{previewStatus.label}</span>
                      <span className="mt-0.5 block normal-case tracking-normal opacity-80">{previewStatus.detail}</span>
                    </span>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-[#09090b] border border-zinc-800 text-right">
                  <span className="text-[10px] uppercase font-bold text-zinc-550 block">Saldo Final Determinado</span>
                  <span className={`text-2xl font-black font-mono block ${calculationResult.impuestoAPagarOARCA.isNegative() ? 'text-emerald-450' : 'text-white'}`}>
                    ${calculationResult.impuestoAPagarOARCA.toNumber().toLocaleString('es-AR')}
                  </span>
                  <span className="text-[9px] font-semibold text-zinc-400 block -mt-1">
                    {calculationResult.impuestoAPagarOARCA.isNegative() ? 'SALDO A FAVOR DEL CONTRIBUYENTE' : 'IMPUESTO NETO A PAGAR'}
                  </span>
                </div>
              </div>

              {/* AUDITORÍA Y PANEL DE INCONSISTENCIAS / CONTROL DE CONSUMO */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Control de Consistencia y Auditoría Impositiva</h3>
                
                {/* Cuadre Consumo JVP */}
                <div className="p-5 rounded-xl bg-[#09090b] border border-zinc-800 grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div>
                    <span className="text-xs text-zinc-500 block">Patrimonio al Inicio</span>
                    <span className="text-base font-bold font-mono text-zinc-300 block">${calculationResult.patrimonioInicioTotal.toNumber().toLocaleString('es-AR')}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Patrimonio al Cierre</span>
                    <span className="text-base font-bold font-mono text-zinc-300 block">${calculationResult.patrimonioCierreTotal.toNumber().toLocaleString('es-AR')}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Total JVP Col. I</span>
                    <span className="text-base font-bold font-mono text-amber-300 block">${calculationResult.jvpTotalColumnaI.toNumber().toLocaleString('es-AR')}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Total JVP Col. II</span>
                    <span className="text-base font-bold font-mono text-emerald-300 block">${calculationResult.jvpTotalColumnaII.toNumber().toLocaleString('es-AR')}</span>
                    <span className="text-[10px] text-zinc-600 block">Cuadre: ${calculationResult.jvpJustificationDiff.toNumber().toLocaleString('es-AR')}</span>
                  </div>
                  <div className="border-l border-zinc-800 pl-6">
                    <span className="text-xs text-teal-400 block font-semibold">Consumo Anual por Diferencia</span>
                    <span className="text-lg font-black font-mono text-white block">${calculationResult.consumoDiferencial.toNumber().toLocaleString('es-AR')}</span>
                  </div>
                </div>

                {/* Mostrar Alertas del Contador Virtual */}
                {calculationResult.warnings.length > 0 && (
                  <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider">
                      <AlertTriangle className="h-4 w-4" />
                      Inconsistencias y Advertencias de AFIP Alertadas
                    </div>
                    <ul className="list-disc pl-5 text-xs text-zinc-400 space-y-1">
                      {calculationResult.warnings.map((w, idx) => (
                        <li key={idx} className="leading-relaxed">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* DESGLOSE POR APARTADOS (STITCH SECTION SUMMARY) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* APARTADO A: ESTADO DE RESULTADOS (3RA CAT) */}
                <div className="p-6 rounded-xl bg-zinc-900/10 border border-zinc-805 space-y-4">
                  <h4 className="text-xs uppercase font-bold text-teal-400 tracking-wider">Resumen Categoría Comercial (Tercera)</h4>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Facturación Gravada:</span>
                      <span className="font-mono text-zinc-300">${calculationResult.ventasGravadas.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Facturación Exenta (Coexistencia):</span>
                      <span className="font-mono text-emerald-400">${calculationResult.ventasExentas.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Costo de Mercaderías Vendidas:</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.costoVentas.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Gastos Deducibles:</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.gastosDeducibles.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Amortizaciones Bienes de Uso (reexpresada):</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.amortizacionesBienesDeUso.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Gastos No Deducibles:</span>
                      <span className="font-mono text-amber-400">${calculationResult.gastosNoDeducibles.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Ajuste por Inflación Impositivo (AXI):</span>
                      <span className={`font-mono ${calculationResult.resultadoAjustePorInflacion.toNumber() >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${calculationResult.resultadoAjustePorInflacion.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-800 pt-2 font-bold">
                      <span className="text-white">Resultado Comercial de 3ra:</span>
                      <span className="font-mono text-white">${calculationResult.resultadoComercialNeto.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                </div>

                {/* APARTADO B: DEDUCCIONES Y MÍNIMOS */}
                <div className="p-6 rounded-xl bg-zinc-900/10 border border-zinc-805 space-y-4">
                  <h4 className="text-xs uppercase font-bold text-teal-400 tracking-wider">Deducciones Aplicadas del Período</h4>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Deducciones Generales Admitidas:</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="rounded-lg border border-zinc-850/70 bg-[#09090b]/70 p-3 space-y-1">
                      {buildGeneralDeductionsBreakdown(calculationResult.deduccionesGenerales).map(({ label, amount }) => (
                        <div key={label} className="flex justify-between gap-3 text-[11px]">
                          <span className="text-zinc-500">{label}:</span>
                          <span className="font-mono text-zinc-300">-{formatDecimal(amount)}</span>
                        </div>
                      ))}
                    </div>
                    {calculationResult.deduccionesGenerales.totalExcedenteDeduccionesGeneralesJvp.gt(0) && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px]">
                        <div className="flex justify-between gap-3">
                          <span className="text-amber-200">Excedente no admitido llevado a JVP:</span>
                          <span className="font-mono text-amber-200">
                            +{formatDecimal(calculationResult.deduccionesGenerales.totalExcedenteDeduccionesGeneralesJvp)}
                          </span>
                        </div>
                        <span className="mt-1 block text-[10px] text-amber-100/60">
                          Equivale a la columna JVP de IG 25 para excedentes sobre topes.
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Mínimo No Imponible:</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.deduccionesPersonales.minimoNoImponible.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Cargas de Familia:</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.deduccionesPersonales.conyuge.add(calculationResult.deduccionesPersonales.hijos).add(calculationResult.deduccionesPersonales.hijosIncapacitados).toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Deducción Especial Admitida:</span>
                      <span className="font-mono text-zinc-300">-${calculationResult.deduccionesPersonales.deduccionEspecial.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-800 pt-2 font-bold">
                      <span className="text-white">Total Deducciones Art. 30:</span>
                      <span className="font-mono text-white">-${calculationResult.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas.toNumber().toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* PAPEL DE TRABAJO DETERMINATIVO CONSOLIDADO */}
              {(() => {
                const appliedQuebrantos = Decimal.min(
                  Decimal.max(new Decimal(calculationResult.resultadoNetoAntesQuebrantos || 0), new Decimal(0)),
                  new Decimal(quebrantosAnteriores || 0)
                );
                
                return (
                  <div className="p-6 rounded-xl bg-zinc-900/10 border border-zinc-800 space-y-6 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                      <div>
                        <h4 className="text-sm font-extrabold text-teal-400 uppercase tracking-wider flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-teal-400" />
                          Papel de Trabajo Determinativo Consolidado
                        </h4>
                        <p className="text-zinc-400 text-xs mt-1">Desglose analítico de la liquidación impositiva y su consistencia.</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/25 text-teal-400 font-mono">
                          DDJJ GANANCIAS F. 711
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-[#09090b]">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="border-b border-zinc-850 bg-zinc-900/20 text-zinc-450 uppercase font-bold text-[9px] tracking-wider">
                            <th className="px-4 py-3">Rubro / Concepto Determinativo</th>
                            <th className="px-4 py-3">Referencia Legal / Cálculo</th>
                            <th className="px-4 py-3 text-right">Parcial ($)</th>
                            <th className="px-4 py-3 text-right">Total ($)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850/40 text-zinc-300">
                          {/* 1. RESULTADO DE TERCERA CATEGORÍA */}
                          <tr className="bg-zinc-900/10">
                            <td colSpan={4} className="px-4 py-2 font-bold text-teal-400 uppercase tracking-wider text-[10px]">
                              1. Determinación del Resultado Neto (Tercera Categoría)
                            </td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">Ventas Gravadas del Ejercicio</td>
                            <td className="px-4 py-2.5 text-zinc-500">Facturación Gravada 3ra Cat</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">{formatDecimal(calculationResult.ventasGravadas)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Costo de Mercaderías Vendidas</td>
                            <td className="px-4 py-2.5 text-zinc-500">CMV = Exist. Inicial + Compras - Exist. Final</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.costoVentas)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Gastos de Explotación y Administración</td>
                            <td className="px-4 py-2.5 text-zinc-500">Gastos Deducibles Declarados</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.gastosDeducibles)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Amortizaciones del Ejercicio</td>
                            <td className="px-4 py-2.5 text-zinc-500">Depreciación de Bienes de Uso (Impositivo)</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.amortizacionesBienesDeUso)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(+/-) Ajuste por Inflación Impositivo</td>
                            <td className="px-4 py-2.5 text-zinc-500">AXI Impositivo Neto (Estático + Dinámico)</td>
                            <td className={`px-4 py-2.5 text-right font-mono ${calculationResult.resultadoAjustePorInflacion.toNumber() >= 0 ? 'text-emerald-450' : 'text-red-450'}`}>
                              {calculationResult.resultadoAjustePorInflacion.toNumber() >= 0 ? '+' : ''}{formatDecimal(calculationResult.resultadoAjustePorInflacion)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="bg-zinc-900/30 font-bold border-t border-zinc-800 text-zinc-200">
                            <td colSpan={2} className="px-4 py-2.5">Resultado Neto de Tercera Categoría</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatDecimal(calculationResult.resultadoComercialNeto)}</td>
                          </tr>

                          {/* 2. DEDUCCIONES GENERALES Y COMPENSACIONES */}
                          <tr className="bg-zinc-900/10">
                            <td colSpan={4} className="px-4 py-2 font-bold text-teal-400 uppercase tracking-wider text-[10px]">
                              2. Deducciones Generales y Compensaciones
                            </td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Deducciones Generales Admitidas</td>
                            <td className="px-4 py-2.5 text-zinc-500">Art. 85 / 86 (Autónomos, Prepagas, Educativos, etc.)</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Quebrantos de Ejercicios Anteriores</td>
                            <td className="px-4 py-2.5 text-zinc-500">Compensación de Quebrantos Impositivos</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(appliedQuebrantos)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="bg-zinc-900/30 font-bold border-t border-zinc-800 text-zinc-200">
                            <td colSpan={2} className="px-4 py-2.5">Ganancia Impositiva Neta del Ejercicio</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatDecimal(calculationResult.resultadoImpositivoNeto)}</td>
                          </tr>

                          {/* 3. DEDUCCIONES PERSONALES */}
                          <tr className="bg-zinc-900/10">
                            <td colSpan={4} className="px-4 py-2 font-bold text-teal-400 uppercase tracking-wider text-[10px]">
                              3. Deducciones Personales (Art. 30)
                            </td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Mínimo No Imponible (MNI)</td>
                            <td className="px-4 py-2.5 text-zinc-500">Art. 30, Inc. a (Ganancia No Imponible)</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.deduccionesPersonales.minimoNoImponible)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Cargas de Familia</td>
                            <td className="px-4 py-2.5 text-zinc-500">Art. 30, Inc. b (Cónyuge: {formatDecimal(calculationResult.deduccionesPersonales.conyuge)} + Hijos)</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">
                              (-{formatDecimal(calculationResult.deduccionesPersonales.conyuge.add(calculationResult.deduccionesPersonales.hijos).add(calculationResult.deduccionesPersonales.hijosIncapacitados))})
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Deducción Especial</td>
                            <td className="px-4 py-2.5 text-zinc-500">Art. 30, Inc. c (Condición Fiscal del Contribuyente)</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.deduccionesPersonales.deduccionEspecial)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="bg-zinc-900/30 font-bold border-t border-zinc-800 text-zinc-200">
                            <td colSpan={2} className="px-4 py-2.5">Ganancia Neta Sujeta a Impuesto (Base Imponible)</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatDecimal(calculationResult.gananciaNetaSujetaImpuesto)}</td>
                          </tr>

                          {/* 4. DETERMINACIÓN IMPOSITIVA Y SALDO */}
                          <tr className="bg-zinc-900/10">
                            <td colSpan={4} className="px-4 py-2 font-bold text-teal-400 uppercase tracking-wider text-[10px]">
                              4. Determinación Impositiva y Liquidación Final
                            </td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">Impuesto Progresivo Determinado</td>
                            <td className="px-4 py-2.5 text-zinc-500">Escala Progresiva Art. 94</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">{formatDecimal(calculationResult.impuestoDeterminado)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Retenciones, Percepciones y Pagos a Cuenta</td>
                            <td className="px-4 py-2.5 text-zinc-500">Cómputo Directo de Retenciones Sufridas</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.retencionesYPercepciones)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className="hover:bg-zinc-800/10">
                            <td className="px-6 py-2.5">(-) Saldo a Favor del Contribuyente Período Anterior</td>
                            <td className="px-4 py-2.5 text-zinc-500">Saldo Técnico / Libre Disponibilidad DDJJ anterior</td>
                            <td className="px-4 py-2.5 text-right text-zinc-400 font-mono">(-{formatDecimal(calculationResult.saldoAFavorAnterior)})</td>
                            <td className="px-4 py-2.5 text-right font-mono">-</td>
                          </tr>
                          <tr className={`font-black border-t-2 text-sm ${calculationResult.impuestoAPagarOARCA.isNegative() ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-teal-500/10 border-teal-500 text-teal-400'}`}>
                            <td colSpan={2} className="px-4 py-3 uppercase tracking-wider">
                              {calculationResult.impuestoAPagarOARCA.isNegative() ? 'Saldo Técnico a Favor del Contribuyente' : 'Saldo a Pagar a Favor de ARCA'}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">-</td>
                            <td className="px-4 py-3 text-right font-mono">
                              {calculationResult.impuestoAPagarOARCA.isNegative() ? '-' : ''}{formatDecimal(calculationResult.impuestoAPagarOARCA.abs())}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* PROYECCIÓN DE ANTICIPOS 2026 */}
              <div className="p-6 rounded-xl bg-zinc-900/10 border border-zinc-805 space-y-4">
                <h4 className="text-xs uppercase font-bold text-teal-400 tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 stroke-[2.5]" />
                  Proyección de Cinco Anticipos impositivos - Período Fiscal {fiscalYear + 1}
                </h4>
                
                <p className="text-zinc-500 text-xs">
                  De acuerdo a las normativas vigentes, el contribuyente debe abonar cinco cuotas iguales equivalentes al 20% del impuesto proyectado reexpresado por la variación del IPC del período.
                </p>

                <div className="grid grid-cols-5 gap-4 pt-2 text-center">
                  {calculationResult.anticiposSiguientePeriodo.map((anticipo, idx) => (
                    <div key={idx} className="p-3.5 rounded-lg bg-[#09090b] border border-zinc-800 relative">
                      <span className="text-[10px] text-zinc-500 font-bold block mb-1">CUOTA {idx + 1}</span>
                      <span className="font-mono font-bold text-white text-sm">${anticipo.toNumber().toLocaleString('es-AR')}</span>
                      <span className="text-[8px] tracking-wider text-teal-400 font-semibold block mt-0.5">VENCE {fiscalYear + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOTONES DE CIERRE */}
              <div className="flex justify-end gap-4 border-t border-zinc-800 pt-6">
                <button
                  onClick={() => handleSaveAction('borrador')}
                  className="flex items-center justify-center h-11 px-5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Guardar como Borrador
                </button>
                <button
                  onClick={() => handleSaveAction('cerrar')}
                  className="flex items-center justify-center h-11 px-5 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-sm transition-colors shadow-lg shadow-teal-500/10 active:scale-[0.98] cursor-pointer"
                >
                  Cerrar y Bloquear Liquidación
                </button>
              </div>

            </div>
          )}

          {/* BARRA DE NAVEGACIÓN INFERIOR (SIGUIENTE / ANTERIOR) */}
          {currentStep < 6 && (
            <div className="flex items-center justify-between border-t border-zinc-850 pt-8 mt-8">
              <button 
                onClick={() => changeStep(Math.max(1, currentStep - 1))}
                className="flex items-center gap-2 h-10 px-4 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors"
                disabled={currentStep === 1}
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </button>

              <button 
                onClick={() => changeStep(Math.min(6, currentStep + 1))}
                className="flex items-center gap-2 h-10 px-4 rounded bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs uppercase tracking-wider transition-all"
              >
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

        </div>

      </main>

      {/* MODAL DE PERSISTENCIA Y CIERRE (STITCH MODAL) */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090b]/80 backdrop-blur-md transition-all animate-fadeIn">
          <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500 animate-pulse"></div>
            
            {modalLoading ? (
              <div className="space-y-4 py-6">
                <div className="h-12 w-12 border-4 border-teal-500/25 border-t-teal-400 rounded-full animate-spin mx-auto"></div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">Procesando Determinación Impositiva</h3>
                  <p className="text-zinc-400 text-xs">Guardando datos en la base de datos de JABA...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 py-4">
                <div className="h-14 w-14 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
                  <CheckCircle className="h-8 w-8 stroke-[2.5]" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-white">
                    {modalActionType === 'borrador' ? '¡Borrador Guardado Exitosamente!' : '¡Declaración Jurada Cerrada!'}
                  </h3>
                  <p className="text-zinc-400 text-xs leading-normal">
                    {modalActionType === 'borrador' 
                      ? `La liquidación comercial de ${clientName} se ha guardado de manera segura. Puede regresar para continuar cuando lo desee.`
                      : `Se ha cerrado y bloqueado la declaración jurada impositiva de ${clientName} para el período ${fiscalYear}. El Papel de Trabajo determinativo ya está disponible.`}
                  </p>
                </div>

                <div className="pt-2">
                  <Link
                    href="/"
                    className="flex items-center justify-center w-full h-11 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-sm transition-colors active:scale-[0.98]"
                  >
                    Volver al Dashboard Principal
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PANEL FLOTANTE DE IMPACTO FISCAL (LIVE TAX BAR) */}
      {currentStep > 1 && currentStep < 6 && calculationResult && (
        <>
          {isLiveBarOpen ? (
            <div className="fixed top-24 right-6 z-40 w-80 bg-[#121216]/95 border border-zinc-800 rounded-xl p-5 shadow-2xl backdrop-blur-md transition-all duration-300 animate-fadeIn font-sans">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-t-xl"></div>
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-teal-500/10 flex items-center justify-center text-teal-400">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white tracking-wide">Consola Impositiva (En vivo)</span>
                </div>
                <button 
                  onClick={() => setIsLiveBarOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 text-xs font-semibold focus:outline-none px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Minimizar panel"
                >
                  Ocultar
                </button>
              </div>

              <div className="space-y-4">
                <div
                  className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] ${previewStatusClasses}`}
                  title={previewStatus.detail}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${previewStatusDotClasses}`} />
                    {previewStatus.label}
                  </span>
                </div>

                {/* Resultado Comercial */}
                <div className="p-3 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                  <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block mb-1">Resultado Neto 3ra Cat.</span>
                  <span className="text-lg font-black font-mono text-zinc-200">
                    {formatDecimal(calculationResult.resultadoComercialNeto)}
                  </span>
                </div>

                {/* Impuesto Neto */}
                <div className="p-3 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                  <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block mb-1">Impuesto Neto / Saldo DDJJ</span>
                  <span className={`text-xl font-black font-mono block ${calculationResult.impuestoAPagarOARCA.toNumber() > 0 ? 'text-red-400' : 'text-teal-400'}`}>
                    {formatDecimal(calculationResult.impuestoAPagarOARCA)}
                  </span>
                </div>

                {/* Consumo Diferencia (JVP) */}
                <div className="p-3 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                  <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider block mb-1">Consumo Proyectado (JVP)</span>
                  <span className="text-lg font-black font-mono text-zinc-350 block mb-2">
                    {formatDecimal(calculationResult.consumoDiferencial)}
                  </span>
                  
                  {/* Alerta de Descuadre Patrimonial / Consumo Negativo */}
                  {calculationResult.consumoDiferencial.toNumber() < 0 ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase animate-pulse">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Consumo Negativo / Descuadre
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      Patrimonio Consistente
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsLiveBarOpen(true)}
              className="fixed top-24 right-6 z-40 h-10 w-10 rounded-full bg-teal-500 hover:bg-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/20 text-[#09090b] hover:scale-105 active:scale-95 transition-all focus:outline-none cursor-pointer"
              title="Mostrar panel impositivo"
            >
              <Sparkles className="h-5 w-5 animate-pulse" />
            </button>
          )}
        </>
      )}

      {/* FOOTER */}
      <footer className="border-t border-[#1e1e24] bg-[#09090b] mt-20 py-8 text-center text-xs text-zinc-500">
        <p>© 2026 JABA Ganancias Impositivas. Todos los derechos reservados. Diseñado bajo normativas AFIP/ARCA Buenos Aires, Argentina.</p>
      </footer>
      
    </div>
  );
}

