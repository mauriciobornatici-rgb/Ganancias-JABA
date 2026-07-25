'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Printer,
  TrendingUp,
  DollarSign,
  FileText,
  AlertTriangle,
  Building,
  User,
  Activity,
  Calendar,
  FileSpreadsheet
} from 'lucide-react';
import { Decimal } from 'decimal.js';
import { calculateTaxReturn } from '@/domain/ganancias/calculations/determinacionImpuesto';
import { calculateClosingCommercialPatrimony } from '@/domain/ganancias/calculations/patrimonioComercial';
import { buildTaxReturnCalculationInput } from '@/domain/ganancias/mappers/calculationInputMapper';
import { buildGeneralDeductionsBreakdown } from '@/domain/ganancias/presentation/deductionsBreakdown';
import { buildPaymentsOnAccountBreakdown } from '@/domain/ganancias/presentation/paymentsOnAccountBreakdown';
import {
  buildFixedAssetDepreciationForPresentation,
  isWizardFixedAssetRetired,
} from '@/domain/ganancias/presentation/fixedAssetPresentation';
import {
  sumDeductibleCostPurchases,
  sumDeductibleNonCostPurchases,
} from '@/domain/ganancias/presentation/purchaseBreakdown';
import { buildTaxParameterSourceNotice } from '@/domain/ganancias/presentation/taxParameterNotice';
import { buildTaxParameterRequestUrl } from '@/domain/ganancias/presentation/taxParameterRequest';
import { downloadTaxReturnExcel } from '@/domain/ganancias/exports/excelGenerator';
import {
  TaxReturnStatusBadge,
  FiscalDocumentWatermark,
  FiscalDocumentFooter,
  type FiscalDocumentParameterSet,
} from '../fiscalDocumentChrome';

type MoneyValue = Decimal.Value | Decimal | null | undefined;
type ExportMoneyValue = string | number | Decimal | undefined;
type PaperPurchase = NonNullable<Parameters<typeof sumDeductibleCostPurchases>[0]>[number] & {
  isExempt?: unknown;
};

type PaperFixedAsset = Record<string, unknown> & {
  name?: string;
  type?: string;
  purchaseDate?: string | Date;
  originalCost?: ExportMoneyValue;
  customReexpIndex?: ExportMoneyValue;
  usefulLife?: number | string;
  yearsElapsed?: number | string;
  isRetired?: unknown;
};

type PaperBankAccount = {
  nominalInitial?: MoneyValue;
  nominalFinal?: MoneyValue;
  tcInitial?: MoneyValue;
  tcFinal?: MoneyValue;
};

type PaperCashHolding = {
  nominalInitial?: MoneyValue;
  nominalFinal?: MoneyValue;
  tcFinal?: MoneyValue;
};

type PaperBalance = {
  balanceInitial?: MoneyValue;
  balanceFinal?: MoneyValue;
};

type PaperPersonalAsset = {
  valueInitial?: MoneyValue;
  valueFinal?: MoneyValue;
};

type PaperJustification = {
  column?: MoneyValue;
  concept?: string;
  amount?: MoneyValue;
};

type PaperAxiDynamic = {
  date?: string | number | Date;
  type?: string;
};

type PaperBracket = {
  fromAmount: Decimal.Value;
  toAmount?: Decimal.Value | null;
  fixedAmount: Decimal.Value;
  percentage: Decimal.Value;
  excessOf: Decimal.Value;
};

type PaperTaxParams = Record<string, unknown> & {
  brackets?: PaperBracket[];
  parameterSet?: FiscalDocumentParameterSet | null;
};

type PaperDeclarationData = Record<string, unknown> & {
  clientName?: string;
  cuit?: string;
  fiscalYear?: number;
  mainActivity?: string;
  status?: string;
  version?: number;
  updatedAt?: string;
  taxParameterSetId?: string | null;
  initialStock?: MoneyValue;
  finalStock?: MoneyValue;
  bienesNoComputablesInicio?: MoneyValue;
  activoTotalInicio?: MoneyValue;
  pasivoTotalInicio?: MoneyValue;
  fixedAssets?: PaperFixedAsset[];
  purchases?: PaperPurchase[];
  bankAccounts?: PaperBankAccount[];
  cashHoldings?: PaperCashHolding[];
  receivables?: PaperBalance[];
  liabilities?: PaperBalance[];
  personalAssets?: PaperPersonalAsset[];
  personalLiabilities?: PaperPersonalAsset[];
  otherJustifications?: PaperJustification[];
  axiDynamic?: PaperAxiDynamic[];
};

export default function PapelDeTrabajoPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<PaperDeclarationData | null>(null);
  const [taxParams, setTaxParams] = useState<PaperTaxParams | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resumen' | 'formulas'>('resumen');

  const formatMoney = (amount: MoneyValue) => {
    if (amount === undefined || amount === null || amount === '') return '$0,00';
    const num = amount instanceof Decimal ? amount.toNumber() : Number(amount);
    return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    const loadWorkingPaper = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const declarationResponse = await fetch(`/api/declaraciones/${id}`, { signal: controller.signal });
        const declarationPayload = await declarationResponse.json();
        if (!declarationResponse.ok || !declarationPayload.success || !declarationPayload.data) {
          throw new Error(declarationPayload.error || 'No se pudo cargar la declaración.');
        }
        const declaration = declarationPayload.data as PaperDeclarationData;
        if (typeof declaration.fiscalYear !== 'number') {
          throw new Error('La DDJJ no tiene un año fiscal asociado. No es seguro emitir el papel de trabajo.');
        }

        const parameterResponse = await fetch(
          buildTaxParameterRequestUrl(declaration.fiscalYear, declaration.taxParameterSetId),
          { signal: controller.signal },
        );
        const parameterPayload = await parameterResponse.json();
        if (!parameterResponse.ok || !parameterPayload.success || !parameterPayload.data?.parameterSet) {
          throw new Error(parameterPayload.error || 'No se pudieron cargar los parámetros fiscales de la DDJJ.');
        }

        setData(declaration);
        setTaxParams(parameterPayload.data);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'No se pudo preparar el papel de trabajo.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadWorkingPaper();
    return () => controller.abort();
  }, [id]);

  const calculationInputState = React.useMemo(() => {
    if (!data || !taxParams) return { input: null, error: null };
    try {
      return { input: buildTaxReturnCalculationInput(data, taxParams), error: null };
    } catch (e) {
      return {
        input: null,
        error: e instanceof Error ? e.message : 'Los datos de la DDJJ no pudieron normalizarse para el cálculo.',
      };
    }
  }, [data, taxParams]);
  const calculationInput = calculationInputState.input;

  const calculationState = React.useMemo(() => {
    if (!calculationInput) return { result: null, error: null };
    try {
      return { result: calculateTaxReturn(calculationInput), error: null };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : 'El cálculo de la DDJJ no pudo completarse.',
      };
    }
  }, [calculationInput]);
  const calculationResult = calculationState.result;

  const closingCommercialPatrimony = React.useMemo(() => (
    calculationInput ? calculateClosingCommercialPatrimony(calculationInput) : null
  ), [calculationInput]);

  // Variables calculadas
  const clientName = data ? data.clientName : '';
  const cuit = data ? data.cuit : '';
  const year = data ? data.fiscalYear : 2025;
  const mainActivity = data ? data.mainActivity : '';
  const version = data ? data.version : 0;
  const updatedAt = data ? data.updatedAt : '';

  const ventasGravadas = calculationResult ? calculationResult.ventasGravadas : new Decimal(0);
  const ventasExentas = calculationResult ? calculationResult.ventasExentas : new Decimal(0);
  const costoVentas = calculationResult ? calculationResult.costoVentas : new Decimal(0);
  const amortizaciones = calculationResult ? calculationResult.amortizacionesBienesDeUso : new Decimal(0);

  const activeAssets = React.useMemo(() => {
    return (data?.fixedAssets || []).filter((a) => !isWizardFixedAssetRetired(a));
  }, [data]);

  const retiredAssets = React.useMemo(() => {
    return (data?.fixedAssets || []).filter((a) => isWizardFixedAssetRetired(a));
  }, [data]);

  // Gastos deducibles generales cargados del wizard
  const gastosComerciales = React.useMemo(() => {
    if (calculationResult) return calculationResult.gastosDeducibles;
    return sumDeductibleNonCostPurchases(data?.purchases || []);
  }, [calculationResult, data]);
  const comprasCmv = React.useMemo(() => sumDeductibleCostPurchases(data?.purchases || []), [data]);

  const resultadoComercialNeto = calculationResult ? calculationResult.resultadoComercialNeto : new Decimal(0);
  // Punto 3 (2026-07-24): el resultado atribuido de sociedades suma al neto de todas las categorías.
  const participacionSociedades = calculationResult ? calculationResult.resultadoParticipacionSociedades : new Decimal(0);
  const resultadoNetoTodasCategorias = calculationResult ? calculationResult.resultadoNetoTodasCategorias : new Decimal(0);
  // Quebrantos efectivamente aplicados: sin esta línea la resta del Apartado III no cierra.
  const quebrantosAplicados = calculationResult
    ? Decimal.max(calculationResult.resultadoNetoAntesQuebrantos, 0).minus(calculationResult.resultadoImpositivoNeto)
    : new Decimal(0);

  const mni = calculationResult ? calculationResult.deduccionesPersonales.minimoNoImponible : new Decimal(0);
  const deduccionEspecial = calculationResult ? calculationResult.deduccionesPersonales.deduccionEspecial.plus(calculationResult.deduccionesPersonales.deduccionEspecialDoceavaParte || 0) : new Decimal(0);
  const cargasFamilia = calculationResult ? calculationResult.deduccionesPersonales.conyuge.plus(calculationResult.deduccionesPersonales.hijos).plus(calculationResult.deduccionesPersonales.hijosIncapacitados) : new Decimal(0);
  const deduccionesGenerales = calculationResult ? calculationResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas : new Decimal(0);
  const generalDeductionsBreakdown = buildGeneralDeductionsBreakdown(calculationResult?.deduccionesGenerales);
  const taxParameterNotice = buildTaxParameterSourceNotice(data, taxParams);

  const totalDeducciones = mni.plus(deduccionEspecial).plus(cargasFamilia).plus(deduccionesGenerales);
  const baseImponible = React.useMemo(
    () => calculationResult ? calculationResult.gananciaNetaSujetaImpuesto : new Decimal(0),
    [calculationResult]
  );
  const impuestoDeterminado = calculationResult ? calculationResult.impuestoDeterminado : new Decimal(0);

  const appliedBracket = React.useMemo(() => {
    if (!taxParams?.brackets || !baseImponible) return null;
    return taxParams.brackets.find((b) => {
      const fromVal = new Decimal(b.fromAmount);
      const toVal = b.toAmount ? new Decimal(b.toAmount) : null;
      return baseImponible.gt(fromVal) && (toVal === null || baseImponible.lte(toVal));
    }) || taxParams.brackets[0] || null;
  }, [taxParams, baseImponible]);

  const retenciones = calculationResult ? calculationResult.retencionesYPercepciones : new Decimal(0);
  const pagosACuentaBreakdown = buildPaymentsOnAccountBreakdown(calculationResult);
  const saldoTrasladableIdcb = calculationResult ? calculationResult.saldoTrasladableIdcb : new Decimal(0);
  const saldoAFavorAnterior = calculationResult ? calculationResult.saldoAFavorAnterior : new Decimal(0);
  const saldoFinal = calculationResult ? calculationResult.impuestoAPagarOARCA : new Decimal(0);

  const anticipos = calculationResult ? calculationResult.anticiposSiguientePeriodo : [];

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-500 animate-pulse"></div>
          <div className="h-12 w-12 border-4 border-teal-500/25 border-t-teal-400 rounded-full animate-spin mx-auto"></div>
          <h3 className="text-base font-bold text-white">Cargando Papel de Trabajo</h3>
          <p className="text-zinc-400 text-xs">Consultando base de datos y recalculando determinaciones...</p>
        </div>
      </div>
    );
  }

  const blockingError = loadError
    || calculationInputState.error
    || calculationState.error
    || (!data ? 'No hay datos disponibles para emitir el papel de trabajo.' : null)
    || (!calculationResult ? 'El cálculo de la DDJJ no pudo completarse.' : null);
  if (blockingError) {
    return (
      <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center p-6">
        <section role="alert" className="max-w-lg rounded-xl border border-red-500/40 bg-red-950/20 p-6 space-y-4">
          <h1 className="text-lg font-bold">El papel de trabajo no puede emitirse</h1>
          <p className="text-sm text-red-100">{blockingError}</p>
          <p className="text-xs text-zinc-400">No se muestran importes sustitutos ni valores en cero. Corregí la DDJJ o su normativa y volvé a intentarlo.</p>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-teal-200">
            <ArrowLeft className="h-4 w-4" /> Volver a Consola
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200 p-6 md:p-12 print:bg-white print:text-black">

      {/* CONTROL DE VOLVER / IMPRIMIR (NO PRINT) */}
      <div className="max-w-5xl mx-auto flex items-center justify-between mb-8 print:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Consola
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href={`/declaraciones/${id}/informe-cliente`}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs uppercase tracking-wider transition-all border border-zinc-700 shadow-lg active:scale-[0.98]"
          >
            <FileText className="h-4 w-4 stroke-[2.5] text-teal-400" />
            Informe Ejecutivo
          </Link>

          <button
            onClick={() => downloadTaxReturnExcel(data ?? undefined, calculationResult)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs uppercase tracking-wider transition-all border border-zinc-700 shadow-lg active:scale-[0.98]"
          >
            <FileSpreadsheet className="h-4 w-4 stroke-[2.5] text-emerald-400" />
            Descargar Excel
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs uppercase tracking-wider transition-all shadow-lg hover:shadow-teal-500/20 active:scale-[0.98]"
          >
            <Printer className="h-4 w-4 stroke-[2.5]" />
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* DOCUMENTO PRINCIPAL (PAPEL DE TRABAJO IMPOSITIVO) */}
      <article className="print-fiscal-doc max-w-5xl mx-auto bg-[#121216] border border-zinc-800 rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden print:border-0 print:bg-white print:p-0 print:shadow-none">

        <FiscalDocumentWatermark status={data?.status} />

        {/* Sello con el estado real de la DDJJ */}
        <div className="absolute top-6 right-6 flex items-center gap-2 print:top-0 print:right-0">
          <TaxReturnStatusBadge status={data?.status} />
        </div>

        {/* ENCABEZADO CORPORATIVO */}
        <header className="border-b border-[#1e1e24] pb-8 mb-8 print:border-black">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex rounded-lg bg-white p-1.5 print:p-0 print:rounded-none">
              <Image src="/logo-jaba-color.jpg" alt="JABA Dirección y Gestión" width={1064} height={946} className="h-14 w-auto print:h-16" priority />
            </div>
            <span className="text-[10px] uppercase tracking-wider block text-teal-400 font-bold print:text-black">Estudio Impositivo Contable</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white print:text-black">Papel de Trabajo Determinativo</h1>
              <p className="text-zinc-400 text-xs mt-1 print:text-black">Impuesto a las Ganancias de Personas Humanas y Sucesiones Indivisas.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-zinc-500 font-mono print:text-black">
                <span>DDJJ v{version}{data?.status ? ` — ${data.status}` : ''}</span>
                <span>•</span>
                <span>Última modificación: {updatedAt ? new Date(updatedAt).toLocaleDateString('es-AR') : '—'}</span>
                {taxParams?.parameterSet?.sourceLaw && (
                  <>
                    <span>•</span>
                    <span>Normativa: {taxParams.parameterSet.sourceLaw}</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#09090b] border border-zinc-805 grid grid-cols-2 gap-4 text-xs font-mono print:border-black print:bg-white print:text-black">
              <div>
                <span className="text-zinc-550 block uppercase font-bold text-[9px]">Período Fiscal</span>
                <span className="text-teal-400 font-bold text-base print:text-black">{year}</span>
              </div>
              <div className="text-right">
                <span className="text-zinc-550 block uppercase font-bold text-[9px]">Impuesto Neto</span>
                <span className="text-white font-extrabold text-base print:text-black">
                  ${impuestoDeterminado.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </header>

        {taxParameterNotice && (
          <section className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100 print:border-black print:bg-white print:text-black">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300 print:text-black" />
              <div>
                <p className="font-bold uppercase tracking-wider">Control de parametros</p>
                <p className="mt-1 leading-relaxed">{taxParameterNotice}</p>
              </div>
            </div>
          </section>
        )}

        {/* FICHA CONTRIBUYENTE */}
        <section className="print-keep grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 p-6 rounded-xl bg-[#09090b] border border-zinc-805 print:border-black print:bg-white print:text-black print:p-3 print:mb-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-teal-400 print:text-black stroke-[2.5]" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Contribuyente</span>
              <span className="text-xs font-bold text-white print:text-black">{clientName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-teal-400 print:text-black stroke-[2.5]" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">CUIT Impositivo</span>
              <span className="text-xs font-mono font-bold text-white print:text-black">{cuit}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building className="h-5 w-5 text-teal-400 print:text-black stroke-[2.5]" />
            <div>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block">Actividad Principal</span>
              <span className="text-xs font-bold text-white print:text-black">{mainActivity}</span>
            </div>
          </div>
        </section>

        {/* PESTAÑAS DE NAVEGACIÓN (STITCH TAB STYLE) - NO SE IMPRIME */}
        <div className="flex bg-[#09090b] p-1 rounded-xl border border-zinc-800 mb-8 max-w-md print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('resumen')}
            className={`flex-1 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeTab === 'resumen'
                ? 'bg-zinc-800 text-white shadow-md'
                : 'text-zinc-500 hover:text-zinc-350'
            }`}
          >
            Resumen de Liquidación
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('formulas')}
            className={`flex-1 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeTab === 'formulas'
                ? 'bg-zinc-800 text-white shadow-md'
                : 'text-zinc-500 hover:text-zinc-350'
            }`}
          >
            Soporte de Fórmulas
          </button>
        </div>

        {activeTab === 'resumen' ? (
          <div className="space-y-8 print:space-y-4">

            {/* APARTADO I: CATEGORÍA DE GANANCIAS */}
            <section className="print-keep space-y-3">
              <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
                <span>Apartado I: Rentas de la Tercera Categoría (Comerciales)</span>
                <span className="text-[10px] font-mono text-zinc-400">Determinación Cedular</span>
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=2`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-400 print:text-black font-semibold">Facturación Gravada Anual (Ventas)</span>
                  <span className="text-zinc-200 font-bold print:text-black">${ventasGravadas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=2`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black text-emerald-400 print:text-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black">Facturación Exenta / Monotributo</span>
                  <span>${ventasExentas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=3`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">(-) Costo de Mercaderías y Materiales</span>
                  <span className="text-red-400 print:text-black">-${costoVentas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=3`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-350 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">(-) Gastos de Estructura y Estáticos</span>
                  <span className="text-red-400 print:text-black">-${gastosComerciales.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=4`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-350 transition-all px-2 rounded">
                  <span className="text-zinc-455 print:text-black font-semibold">(-) Amortizaciones del Ejercicio</span>
                  <span className="text-red-400 print:text-black">-${amortizaciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {calculationResult && calculationResult.bajaBienesDeUsoLoss && calculationResult.bajaBienesDeUsoLoss.gt(0) && (
                  <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=4`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-350 transition-all px-2 rounded">
                    <span className="text-zinc-455 print:text-black font-semibold">(-) Costo computable por bajas de bienes de uso</span>
                    <span className="text-red-400 print:text-black">-${calculationResult.bajaBienesDeUsoLoss.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-350 transition-all px-2 rounded">
                  <span className="text-zinc-455 print:text-black font-semibold">(+/-) Ajuste por Inflación Impositivo (AXI)</span>
                  <span className={calculationResult && calculationResult.resultadoAjustePorInflacion.isNegative() ? 'text-red-400 font-bold' : 'text-emerald-450 font-bold'}>
                    {calculationResult && calculationResult.resultadoAjustePorInflacion.isPositive() ? '+' : ''}
                    {formatMoney(calculationResult?.resultadoAjustePorInflacion)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                  <span className="font-sans">Resultado de la Categoría Comercial</span>
                  <span>${resultadoComercialNeto.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {!participacionSociedades.isZero() && (
                  <>
                    <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=2`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                      <span className="text-zinc-450 print:text-black font-semibold">(+/-) Resultado Atribuido por Participación en Sociedades</span>
                      <span className={participacionSociedades.isNegative() ? 'text-red-400 print:text-black' : 'text-emerald-450 print:text-black'}>
                        {participacionSociedades.isPositive() ? '+' : ''}
                        {formatMoney(participacionSociedades)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                      <span className="font-sans">Resultado Neto de Todas las Categorías</span>
                      <span>${resultadoNetoTodasCategorias.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* APARTADO II: DEDUCCIONES ADMITIDAS */}
            <section className="print-keep space-y-3">
              <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
                <span>Apartado II: Deducciones Personales y Mínimos (Art. 30)</span>
                <span className="text-[10px] font-mono text-zinc-400">Topes Aplicados 2024/2025</span>
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-400 print:text-black font-semibold">Mínimo No Imponible (MNI)</span>
                  <span className="text-red-400 print:text-black">-${mni.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">Deducción Especial (Art. 30 Inc. C)</span>
                  <span className="text-red-400 print:text-black">-${deduccionEspecial.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">Cargas de Familia (Cónyuge e Hijos)</span>
                  <span className="text-red-400 print:text-black">-${cargasFamilia.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">Deducciones Generales Admitidas (Seguros/Educativos)</span>
                  <span className="text-red-400 print:text-black">-${deduccionesGenerales.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {generalDeductionsBreakdown.map(({ label, reference, amount }) => (
                  <div key={reference} className="flex justify-between gap-4 py-1 pl-4 border-b border-zinc-850/20 print:border-black text-[11px]">
                    <span className="text-zinc-550 print:text-black">
                      {label} <span className="text-zinc-600 print:text-black">({reference})</span>
                    </span>
                    <span className="text-red-400 print:text-black">-${amount.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                  <span className="font-sans">Total Erogaciones Deducibles</span>
                  <span>-${totalDeducciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </section>

            {/* APARTADO III: ESCALA ARTÍCULO 94 */}
            <section className="print-keep space-y-3">
              <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
                <span>Apartado III: Determinación de la Base Imponible y Alícuota</span>
                <span className="text-[10px] font-mono text-zinc-400">Escala de Tramos Art. 94</span>
              </h3>

              <div className="space-y-2 text-xs font-mono">
                {/* Arranca del neto de TODAS las categorías (comercial + sociedades atribuidas):
                    si no, con participaciones cargadas la resta de abajo no cierra con la base. */}
                <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                  <span className="text-zinc-400 print:text-black">
                    {participacionSociedades.isZero() ? 'Ganancia Neta Comercial' : 'Ganancia Neta de Todas las Categorías'}
                  </span>
                  <span className="text-zinc-200 print:text-black">${resultadoNetoTodasCategorias.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                  <span className="text-zinc-450 print:text-black">(-) Total Erogaciones y Deducciones Computadas</span>
                  <span className="text-red-400 print:text-black">-${totalDeducciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {quebrantosAplicados.gt(0) && (
                  <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                    <span className="text-zinc-450 print:text-black">(-) Quebrantos de Ejercicios Anteriores Aplicados</span>
                    <span className="text-red-400 print:text-black">-${quebrantosAplicados.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                  <span className="font-sans text-teal-400 print:text-black">Base Imponible (Ganancia Neta Sujeta a Impuesto)</span>
                  <span className="text-teal-400 print:text-black">${baseImponible.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="mt-4 p-4 rounded-lg bg-[#09090b] border border-zinc-805 print:border-black print:bg-white print:text-black">
                  <span className="text-[9px] uppercase tracking-wider text-zinc-550 font-bold block mb-1">Cómputo en Alícuotas Escalonadas (Art. 94)</span>
                  <p className="text-xs text-zinc-400 leading-normal print:text-black">
                    {appliedBracket ? (
                      <>
                        Tramos aplicados sobre el excedente de ${new Decimal(appliedBracket.excessOf).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Impuesto base impositivo fijo determinado: ${new Decimal(appliedBracket.fixedAmount).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Alícuota final aplicada en la escala progresiva: <strong className="text-teal-400 print:text-black">{(new Decimal(appliedBracket.percentage).mul(100)).toNumber()}%</strong>.
                      </>
                    ) : (
                      <>No hay tramos de escala impositiva aplicados para esta ganancia neta.</>
                    )}
                  </p>
                </div>
              </div>
            </section>

            {/* APARTADO IV: PAGOS A CUENTA Y SALDO FINAL */}
            <section className="print-keep space-y-3">
              <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
                <span>Apartado IV: Retenciones, Percepciones y Saldo de Impuesto</span>
                <span className="text-[10px] font-mono text-zinc-400">Mis Retenciones AFIP</span>
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black px-2 rounded">
                  <span className="text-zinc-400 print:text-black font-semibold">Impuesto a las Ganancias Determinado Anual</span>
                  <span className="text-zinc-200 font-bold print:text-black">${impuestoDeterminado.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">(-) Retenciones y Percepciones Computables</span>
                  <span className="text-emerald-400 print:text-black">-${retenciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {/* Pagos a cuenta del IG 25 F62:F66. Sin estas líneas, la resta de abajo no cierra
                    con el saldo determinado cuando hay impuesto al cheque, anticipos o combustibles. */}
                {pagosACuentaBreakdown.map(({ label, reference, amount }) => (
                  <div key={reference} onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                    <span className="text-zinc-450 print:text-black font-semibold">
                      (-) {label} <span className="text-zinc-600 print:text-black">({reference})</span>
                    </span>
                    <span className="text-emerald-400 print:text-black">-${amount.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div onClick={() => router.push(`/declaraciones/${id}/wizard?step=5`)} className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black cursor-pointer hover:bg-zinc-800/20 hover:text-teal-300 transition-all px-2 rounded">
                  <span className="text-zinc-450 print:text-black font-semibold">(-) Saldo a Favor del Período Anterior</span>
                  <span className="text-emerald-400 print:text-black">-${saldoAFavorAnterior.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {saldoTrasladableIdcb.gt(0) && (
                  <p className="px-2 pt-1 text-[10px] leading-4 text-amber-300 print:text-black">
                    Impuesto al cheque no computado por exceder el impuesto determinado: $
                    {saldoTrasladableIdcb.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })} (IG 25 F70).
                    No es saldo de libre disponibilidad: queda trasladable como IDCB.
                  </p>
                )}
                <div className="flex justify-between py-2.5 border-t border-zinc-800 font-black text-white print:text-black print:border-black text-sm bg-zinc-900/20 px-3 rounded">
                  <span className="font-sans">Saldo Determinado (Saldo a Pagar al Fisco / A Favor)</span>
                  <span className={saldoFinal.isNegative() ? 'text-emerald-400' : 'text-white print:text-black'}>
                    ${saldoFinal.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </section>

            {/* APARTADO V: PROYECCIÓN DE ANTICIPOS */}
            <section className="print-keep space-y-3">
              <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
                <span>Apartado V: Proyección de Anticipos Impositivos (Siguiente Período)</span>
                <span className="text-[10px] font-mono text-zinc-400">Cinco Cuotas 20%</span>
              </h3>

              <p className="text-zinc-550 text-xs print:text-black">
                Los anticipos se liquidan y vencen de forma mensual e indexada para mitigar el devengamiento de intereses resarcitorios:
              </p>

              <div className="print-keep grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 text-center print:grid-cols-5">
                {anticipos.map((anticipo, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg bg-[#09090b] border border-zinc-805 print:border-black print:bg-white print:text-black">
                    <span className="text-[10px] text-zinc-500 font-bold block mb-1">ANTICIPO {idx + 1}</span>
                    <span className="font-mono font-bold text-white text-xs print:text-black">${anticipo.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-[8px] tracking-wider text-teal-400 font-semibold block mt-0.5 print:text-black">20% Vto</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-8 print:space-y-4">

            {/* 1. SOPORTE DE COSTO DE VENTAS */}
            <section className="p-6 rounded-xl bg-[#09090b] border border-zinc-805 space-y-4 print:p-3 print:space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">1. Soporte de Costo de Ventas (CMV)</h3>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Fórmula: Existencia Inicial + Compras - Existencia Final</span>
                </div>
                <Activity className="h-5 w-5 text-teal-400" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2 text-xs font-mono text-zinc-400">
                  <div className="flex justify-between py-1 border-b border-zinc-900">
                    <span>Existencia Inicial (Stock al Inicio)</span>
                    <span className="text-zinc-200">{formatMoney(data?.initialStock)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-900 text-teal-400">
                    <span>(+) Compras Netas (Materia Prima / Mercaderías)</span>
                    <span>{formatMoney(comprasCmv)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-900">
                    <span>(-) Existencia Final (Stock al Cierre)</span>
                    <span className="text-red-400">-{formatMoney(data?.finalStock)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white text-sm">
                    <span>Costo de Ventas Calculado (CMV)</span>
                    <span>{formatMoney(costoVentas)}</span>
                  </div>
                </div>
                <div className="print-keep p-4 rounded-lg bg-[#121216] border border-zinc-850 flex flex-col justify-center print:p-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider mb-2">Trazabilidad Matemática:</span>
                  <div className="font-mono text-xs text-zinc-300 space-y-1 bg-zinc-950/40 p-3 rounded border border-zinc-900">
                    <p className="pl-4">  {Number(data?.initialStock || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-zinc-650">[Stock Inicial]</span></p>
                    <p className="pl-2">+ {comprasCmv.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-teal-400">[Compras]</span></p>
                    <p className="pl-2">- {Number(data?.finalStock || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-red-400">[Stock Final]</span></p>
                    <div className="border-t border-zinc-800 my-1"></div>
                    <p className="font-bold text-white">= {costoVentas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-zinc-500">[Costo de Ventas]</span></p>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. SOPORTE DE AMORTIZACIÓN Y BAJAS */}
            <section className="p-6 rounded-xl bg-[#09090b] border border-zinc-805 space-y-6 print:p-3 print:space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">2. Soporte de Amortización y Bajas de Bienes de Uso</h3>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Detalle impositivo de amortizaciones anuales y pérdidas por baja en el ejercicio</span>
                </div>
                <TrendingUp className="h-5 w-5 text-teal-400" />
              </div>

              <div className="space-y-4">
                <h4 className="text-[11px] uppercase font-bold text-zinc-450 tracking-wider">Bienes de Uso Activos (Amortizables)</h4>
                <div className="overflow-x-auto border border-zinc-850 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/10 text-zinc-500 font-bold uppercase tracking-wider">
                        <th className="px-4 py-2">Bien</th>
                        <th className="px-4 py-2">Costo Origen</th>
                        <th className="px-4 py-2">Vida Útil (Años)</th>
                        <th className="px-4 py-2 text-center">Años Transc.</th>
                        <th className="px-4 py-2 text-right">Coef. Reexp.</th>
                        <th className="px-4 py-2 text-right">Amortización Anual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 text-zinc-350">
                      {activeAssets.length > 0 ? (
                        activeAssets.map((asset, idx) => {
                          const detail = buildFixedAssetDepreciationForPresentation(asset);
                          const cost = detail.originalCost.toNumber();
                          const coef = detail.customReexpIndex?.toNumber() ?? 1;
                          return (
                            <tr key={idx} className="hover:bg-zinc-800/5">
                              <td className="px-4 py-2 text-white font-sans font-semibold">{asset.name || 'Bien sin nombre'}</td>
                              <td className="px-4 py-2">{formatMoney(cost)}</td>
                              <td className="px-4 py-2">{detail.usefulLife}</td>
                              <td className="px-4 py-2 text-center">{detail.yearsElapsed || 0}</td>
                              <td className="px-4 py-2 text-right font-mono">{coef.toFixed(4)}</td>
                              <td className="px-4 py-2 text-right text-teal-400 font-bold">{formatMoney(detail.annualDepreciationAdj)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 text-center text-zinc-600 font-sans">No hay Bienes de Uso activos registrados.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="print-keep p-3 rounded-lg bg-[#121216]/50 border border-zinc-850 font-mono text-xs text-zinc-400 flex justify-between items-center print:p-2">
                  <span>Total Amortización del Ejercicio (Detalle):</span>
                  <span className="text-white font-extrabold text-xs">{formatMoney(amortizaciones)}</span>
                </div>
              </div>

              {retiredAssets.length > 0 && (
                <div className="space-y-4 border-t border-zinc-850 pt-4">
                  <h4 className="text-[11px] uppercase font-bold text-zinc-450 tracking-wider">Bienes de Uso Dados de Baja en el Ejercicio</h4>
                  <div className="overflow-x-auto border border-zinc-850 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/10 text-zinc-500 font-bold uppercase tracking-wider">
                          <th className="px-4 py-2">Bien Dado de Baja</th>
                          <th className="px-4 py-2">Costo Origen</th>
                          <th className="px-4 py-2">Amort. Acum. Inicio</th>
                          <th className="px-4 py-2">Val. Residual Inicio (Hist)</th>
                          <th className="px-4 py-2 text-right">Coef. Reexp.</th>
                          <th className="px-4 py-2 text-right">Pérdida por Baja Impositiva</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 text-zinc-350">
                        {retiredAssets.map((asset, idx) => {
                          const detail = buildFixedAssetDepreciationForPresentation(asset);
                          const cost = detail.originalCost.toNumber();
                          const coef = detail.customReexpIndex?.toNumber() ?? 1;
                          return (
                            <tr key={idx} className="hover:bg-zinc-800/5">
                              <td className="px-4 py-2 text-white font-sans font-semibold">{asset.name || 'Bien sin nombre'}</td>
                              <td className="px-4 py-2">{formatMoney(cost)}</td>
                              <td className="px-4 py-2">{formatMoney(detail.accumulatedDepHistAtStart)}</td>
                              <td className="px-4 py-2">{formatMoney(detail.bajaLossHist)}</td>
                              <td className="px-4 py-2 text-right font-mono">{coef.toFixed(4)}</td>
                              <td className="px-4 py-2 text-right text-red-400 font-bold">{formatMoney(detail.bajaLossAdj)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="print-keep p-3 rounded-lg bg-[#121216]/50 border border-zinc-850 font-mono text-xs text-zinc-400 flex justify-between items-center print:p-2">
                    <span>Total Pérdida Computable por Bajas de Bienes de Uso (Apartado I):</span>
                    <span className="text-white font-extrabold text-xs">{formatMoney(calculationResult?.bajaBienesDeUsoLoss)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* 3. SOPORTE DE AJUSTE POR INFLACIÓN (AXI) */}
            <section className="p-6 rounded-xl bg-[#09090b] border border-zinc-805 space-y-6 print:p-3 print:space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">3. Soporte de Ajuste por Inflación (AXI Estático y Dinámico)</h3>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Determinación del ajuste por exposición a la inflación impositiva (Estático + Dinámico)</span>
                </div>
                <Calendar className="h-5 w-5 text-teal-400" />
              </div>

              <div className="space-y-4">
                <h4 className="text-[11px] uppercase font-bold text-zinc-450 tracking-wider">Parte I: Ajuste por Inflación Estático</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2 text-xs font-mono text-zinc-400">
                    <div className="flex justify-between py-1 border-b border-zinc-900">
                      <span>Activo Comercial Total al Inicio</span>
                      <span className="text-zinc-200">{formatMoney(data?.activoTotalInicio)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-900">
                      <span>(-) Bienes No Computables (Stock + Bienes Uso)</span>
                      <span className="text-red-400">-{formatMoney(data?.bienesNoComputablesInicio)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-900 text-teal-400 font-bold text-[11px]">
                      <span>(=) Activo Computable de Inicio</span>
                      <span>{formatMoney(Number(data?.activoTotalInicio || 0) - Number(data?.bienesNoComputablesInicio || 0))}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-900">
                      <span>(-) Pasivo Comercial Total al Inicio</span>
                      <span className="text-red-400">-{formatMoney(data?.pasivoTotalInicio)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white text-xs">
                      <span>(=) Capital Computable al Inicio Sujeto a AXI</span>
                      <span>{formatMoney((Number(data?.activoTotalInicio || 0) - Number(data?.bienesNoComputablesInicio || 0)) - Number(data?.pasivoTotalInicio || 0))}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-900 text-zinc-500">
                      <span>Tasa de Inflación Anual IPC Aplicada</span>
                      <span>
                        {calculationResult ? (new Decimal(calculationResult.axiStaticResult).isZero() ? '0.00' : (new Decimal(calculationResult.axiStaticResult).abs().div(Decimal.max((Number(data?.activoTotalInicio || 0) - Number(data?.bienesNoComputablesInicio || 0)) - Number(data?.pasivoTotalInicio || 0), 1)).mul(100)).toNumber().toFixed(6)) : '0.00'}%
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-teal-400 text-sm">
                      <span>Ajuste por Inflación Estático Determinado</span>
                      <span>{formatMoney(calculationResult?.axiStaticResult)}</span>
                    </div>
                  </div>
                  <div className="print-keep p-4 rounded-lg bg-[#121216] border border-zinc-850 flex flex-col justify-center print:p-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider mb-2">Trazabilidad AXI Estático:</span>
                    <div className="font-mono text-[11px] text-zinc-300 space-y-1 bg-zinc-950/40 p-3.5 rounded border border-zinc-900">
                      <p className="pl-4">  {formatMoney(Number(data?.activoTotalInicio || 0) - Number(data?.bienesNoComputablesInicio || 0))} <span className="text-zinc-650">[Activo Computable]</span></p>
                      <p className="pl-2">- {formatMoney(data?.pasivoTotalInicio)} <span className="text-red-400">[Pasivo Computable]</span></p>
                      <div className="border-t border-zinc-800 my-1"></div>
                      <p className="pl-4">= {formatMoney((Number(data?.activoTotalInicio || 0) - Number(data?.bienesNoComputablesInicio || 0)) - Number(data?.pasivoTotalInicio || 0))} <span className="text-zinc-500">[Capital Computable]</span></p>
                      <p className="pl-2">x {calculationResult ? (new Decimal(calculationResult.axiStaticResult).isZero() ? '0' : (new Decimal(calculationResult.axiStaticResult).abs().div(Decimal.max((Number(data?.activoTotalInicio || 0) - Number(data?.bienesNoComputablesInicio || 0)) - Number(data?.pasivoTotalInicio || 0), 1)).toNumber().toFixed(8))) : '0'} <span className="text-teal-400">[Coef. AXI]</span></p>
                      <div className="border-t border-zinc-800 my-1"></div>
                      <p className="font-bold text-white">= {formatMoney(calculationResult?.axiStaticResult)} <span className="text-zinc-500">[AXI Estático]</span></p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-zinc-850 pt-4">
                <h4 className="text-[11px] uppercase font-bold text-zinc-450 tracking-wider">Parte II: Ajuste por Inflación Dinámico</h4>
                <div className="overflow-x-auto border border-zinc-850 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/10 text-zinc-500 font-bold uppercase tracking-wider">
                        <th className="px-4 py-2">Concepto</th>
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2">Tipo de Movimiento</th>
                        <th className="px-4 py-2 text-right">Monto Base</th>
                        <th className="px-4 py-2 text-right">Coef. Ajuste</th>
                        <th className="px-4 py-2 text-right">Ajuste Dinámico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 text-zinc-350">
                      {calculationResult?.axiDynamicLines && calculationResult.axiDynamicLines.length > 0 ? (
                        calculationResult.axiDynamicLines.map((line, idx) => {
                          const inputItem = data?.axiDynamic?.[idx] || {};
                          const dateFormatted = inputItem.date ? new Date(inputItem.date).toLocaleDateString('es-AR') : '';
                          const movementTypeLabel = inputItem.type === 'AporteCapital' ? 'Aporte de Capital (-1)' : 'Retiro de Socio / Div. (+1)';
                          return (
                            <tr key={idx} className="hover:bg-zinc-800/5">
                              <td className="px-4 py-2 text-white font-sans font-semibold">{line.concept || 'Movimiento dinámico'}</td>
                              <td className="px-4 py-2">{dateFormatted}</td>
                              <td className="px-4 py-2 text-zinc-450">{movementTypeLabel}</td>
                              <td className="px-4 py-2 text-right">{formatMoney(line.amount)}</td>
                              <td className="px-4 py-2 text-right font-mono">{Number(line.factorActualizacion || 1).toFixed(4)}</td>
                              <td className={`px-4 py-2 text-right font-bold ${new Decimal(line.computedAxi || 0).isNegative() ? 'text-red-400' : 'text-emerald-455'}`}>
                                {formatMoney(line.computedAxi)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 text-center text-zinc-600 font-sans">No hay movimientos dinámicos registrados en el ejercicio.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="print-keep p-3 rounded-lg bg-[#121216]/50 border border-zinc-850 font-mono text-xs text-zinc-400 flex justify-between items-center print:p-2">
                  <span>Total Ajuste Dinámico (Detalle):</span>
                  <span className={`font-extrabold text-xs ${calculationResult && calculationResult.axiDynamicResult.isNegative() ? 'text-red-400' : 'text-emerald-455'}`}>
                    {formatMoney(calculationResult?.axiDynamicResult)}
                  </span>
                </div>
              </div>

              {/* CARD RESUMEN NETO CONSOLIDADO */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-[#181820] to-[#121216] border border-zinc-800 shadow-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-teal-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Resumen Ajuste por Inflación Impositivo Neto</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                    <span className="text-[9px] uppercase font-bold text-zinc-550 block mb-1">AXI Estático</span>
                    <span className={`text-sm font-bold ${calculationResult && calculationResult.axiStaticResult.isNegative() ? 'text-red-400' : 'text-emerald-455'}`}>
                      {formatMoney(calculationResult?.axiStaticResult)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#09090b]/80 border border-zinc-850">
                    <span className="text-[9px] uppercase font-bold text-zinc-550 block mb-1">AXI Dinámico</span>
                    <span className={`text-sm font-bold ${calculationResult && calculationResult.axiDynamicResult.isNegative() ? 'text-red-400' : 'text-emerald-455'}`}>
                      {formatMoney(calculationResult?.axiDynamicResult)}
                    </span>
                  </div>
                  <div className={`p-3 rounded-lg bg-[#09090b]/80 border ${calculationResult && calculationResult.resultadoAjustePorInflacion.isNegative() ? 'border-red-500/20' : 'border-emerald-500/20'}`}>
                    <span className="text-[9px] uppercase font-bold text-zinc-550 block mb-1">AXI Neto Computable</span>
                    <span className={`text-sm font-extrabold ${calculationResult && calculationResult.resultadoAjustePorInflacion.isNegative() ? 'text-red-400' : 'text-emerald-455'}`}>
                      {formatMoney(calculationResult?.resultadoAjustePorInflacion)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. SOPORTE DE PATRIMONIO NETO */}
            <section className="p-6 rounded-xl bg-[#09090b] border border-zinc-805 space-y-4 print:p-3 print:space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">4. Soporte de Patrimonio Neto Comercial y Personal</h3>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Composición de Activos y Pasivos al Inicio y al Cierre</span>
                </div>
                <Building className="h-5 w-5 text-teal-400" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs font-mono text-zinc-400">
                {/* PATRIMONIO INICIO */}
                <div className="print-keep space-y-3 p-4 rounded-lg bg-[#121216] border border-zinc-850 print:p-2">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-450 tracking-wider border-b border-zinc-800 pb-2">Patrimonio Neto al INICIO</h4>
                  <div className="space-y-1 pl-2 border-l border-zinc-800">
                    <span className="text-[9px] uppercase text-zinc-550 font-bold block">Rubros Comerciales (Inicio)</span>
                    <div className="flex justify-between">
                      <span>Bancos (Saldos iniciales)</span>
                      <span className="text-zinc-300">{formatMoney((data?.bankAccounts || []).reduce((sum, b) => sum + Number(b.nominalInitial || 0) * Number(b.tcInitial || 1), 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Efectivo (Saldos iniciales)</span>
                      <span className="text-zinc-300">{formatMoney((data?.cashHoldings || []).reduce((sum, c) => sum + Number(c.nominalInitial || 0) * Number(c.tcFinal || 1), 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Créditos comerciales / fiscales</span>
                      <span className="text-zinc-300">{formatMoney((data?.receivables || []).reduce((sum, r) => sum + Number(r.balanceInitial || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Existencia Inicial (Bienes de Cambio)</span>
                      <span className="text-zinc-300">{formatMoney(data?.initialStock)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bienes de Uso (Costo de origen)</span>
                      <span className="text-zinc-300">{formatMoney(activeAssets.reduce((sum, f) => sum + Number(f.originalCost || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>(-) Deudas Comerciales (Proveedores)</span>
                      <span>-{formatMoney((data?.liabilities || []).reduce((sum, l) => sum + Number(l.balanceInitial || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-200 border-t border-zinc-900/60 pt-1 text-[11px]">
                      <span>(=) Subtotal Patrimonio Comercial</span>
                      <span>{formatMoney(Number(data?.activoTotalInicio || 0) - Number(data?.pasivoTotalInicio || 0))}</span>
                    </div>
                  </div>
                  <div className="space-y-1 pl-2 border-l border-zinc-800 mt-4">
                    <span className="text-[9px] uppercase text-zinc-550 font-bold block">Rubros Personales (Inicio)</span>
                    <div className="flex justify-between">
                      <span>Bienes y Activos Personales</span>
                      <span className="text-zinc-300">{formatMoney((data?.personalAssets || []).reduce((sum, a) => sum + Number(a.valueInitial || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>(-) Pasivos y Deudas Personales</span>
                      <span>-{formatMoney((data?.personalLiabilities || []).reduce((sum, l) => sum + Number(l.valueInitial || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-200 border-t border-zinc-900/60 pt-1 text-[11px]">
                      <span>(=) Subtotal Patrimonio Personal</span>
                      <span>{formatMoney((data?.personalAssets || []).reduce((sum, a) => sum + Number(a.valueInitial || 0), 0) - (data?.personalLiabilities || []).reduce((sum, l) => sum + Number(l.valueInitial || 0), 0))}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-zinc-800 font-extrabold text-teal-400 text-sm mt-4">
                    <span>PATRIMONIO NETO INICIO (JVP)</span>
                    <span>{formatMoney(calculationResult?.patrimonioInicioTotal)}</span>
                  </div>
                </div>

                {/* PATRIMONIO CIERRE */}
                <div className="print-keep space-y-3 p-4 rounded-lg bg-[#121216] border border-zinc-850 print:p-2">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-450 tracking-wider border-b border-zinc-800 pb-2">Patrimonio Neto al CIERRE</h4>
                  <div className="space-y-1 pl-2 border-l border-zinc-800">
                    <span className="text-[9px] uppercase text-zinc-550 font-bold block">Rubros Comerciales (Cierre)</span>
                    <div className="flex justify-between">
                      <span>Bancos (Saldos finales)</span>
                      <span className="text-zinc-300">{formatMoney((data?.bankAccounts || []).reduce((sum, b) => sum + Number(b.nominalFinal || 0) * Number(b.tcFinal || 1), 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Efectivo (Saldos finales)</span>
                      <span className="text-zinc-300">{formatMoney((data?.cashHoldings || []).reduce((sum, c) => sum + Number(c.nominalFinal || 0) * Number(c.tcFinal || 1), 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Créditos comerciales / fiscales</span>
                      <span className="text-zinc-300">{formatMoney((data?.receivables || []).reduce((sum, r) => sum + Number(r.balanceFinal || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Existencia Final (Bienes de Cambio)</span>
                      <span className="text-zinc-300">{formatMoney(data?.finalStock)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bienes de Uso (Costo de origen)</span>
                      <span className="text-zinc-300">{formatMoney((data?.fixedAssets || []).reduce((sum, f) => sum + Number(f.originalCost || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>(-) Deudas Comerciales (Proveedores)</span>
                      <span>-{formatMoney((data?.liabilities || []).reduce((sum, l) => sum + Number(l.balanceFinal || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-200 border-t border-zinc-900/60 pt-1 text-[11px]">
                      <span>(=) Subtotal Patrimonio Comercial</span>
                      <span>{formatMoney(closingCommercialPatrimony?.patrimonioComercialCierre)}</span>
                    </div>
                  </div>
                  <div className="space-y-1 pl-2 border-l border-zinc-800 mt-4">
                    <span className="text-[9px] uppercase text-zinc-550 font-bold block">Rubros Personales (Cierre)</span>
                    <div className="flex justify-between">
                      <span>Bienes y Activos Personales</span>
                      <span className="text-zinc-300">{formatMoney((data?.personalAssets || []).reduce((sum, a) => sum + Number(a.valueFinal || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>(-) Pasivos y Deudas Personales</span>
                      <span>-{formatMoney((data?.personalLiabilities || []).reduce((sum, l) => sum + Number(l.valueFinal || 0), 0))}</span>
                    </div>
                    <div className="flex justify-between font-bold text-zinc-200 border-t border-zinc-900/60 pt-1 text-[11px]">
                      <span>(=) Subtotal Patrimonio Personal</span>
                      <span>{formatMoney((data?.personalAssets || []).reduce((sum, a) => sum + Number(a.valueFinal || 0), 0) - (data?.personalLiabilities || []).reduce((sum, l) => sum + Number(l.valueFinal || 0), 0))}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-zinc-800 font-extrabold text-teal-400 text-sm mt-4">
                    <span>PATRIMONIO NETO CIERRE (JVP)</span>
                    <span>{formatMoney(calculationResult?.patrimonioCierreTotal)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 5. SOPORTE DE JVP Y CONSUMO */}
            <section className="p-6 rounded-xl bg-[#09090b] border border-zinc-805 space-y-4 print:p-3 print:space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">5. Soporte de Justificación de Variaciones Patrimoniales (JVP)</h3>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Fórmula de Balanceo: Columna II (Recursos) - Columna I (Erogaciones Declaradas) = Consumo</span>
                </div>
                <User className="h-5 w-5 text-teal-400" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs font-mono text-zinc-400">
                {/* COL II */}
                <div className="print-keep space-y-2 p-4 rounded-lg bg-[#121216] border border-zinc-850 print:p-2">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-450 tracking-wider border-b border-zinc-800 pb-2">Columna II (Recursos / Justificaciones)</h4>
                  <div className="flex justify-between">
                    <span>Patrimonio Neto al Inicio</span>
                    <span className="text-zinc-200">{formatMoney(calculationResult?.patrimonioInicioTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Resultado Impositivo Neto (Beneficio)</span>
                    <span className="text-zinc-200">{formatMoney(calculationResult && calculationResult.resultadoImpositivoNeto.isPositive() ? calculationResult.resultadoImpositivoNeto : new Decimal(0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ingresos Exentos / No Gravados</span>
                    <span className="text-zinc-200">{formatMoney(ventasExentas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amortizaciones Bienes de Uso (No monetario)</span>
                    <span className="text-zinc-200">{formatMoney(amortizaciones)}</span>
                  </div>
                  {calculationResult && calculationResult.resultadoAjustePorInflacion.isNegative() && (
                    <div className="flex justify-between">
                      <span>AXI Impositivo (Pérdida - Justifica recurso)</span>
                      <span className="text-zinc-200">{formatMoney(calculationResult.resultadoAjustePorInflacion.abs())}</span>
                    </div>
                  )}
                  {(data?.otherJustifications || []).filter((j) => Number(j.column) === 2).map((j, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] pl-2 border-l border-zinc-900">
                      <span>{j.concept} <span className="text-zinc-650">[Manual]</span></span>
                      <span className="text-zinc-200">{formatMoney(j.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 border-t border-zinc-800 font-extrabold text-white text-xs mt-3">
                    <span>Total Recursos (Columna II)</span>
                    <span>{formatMoney(calculationResult?.jvpTotalColumnaII)}</span>
                  </div>
                </div>

                {/* COL I */}
                <div className="print-keep space-y-2 p-4 rounded-lg bg-[#121216] border border-zinc-850 print:p-2">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-450 tracking-wider border-b border-zinc-800 pb-2">Columna I (Erogaciones / Aplicaciones)</h4>
                  <div className="flex justify-between">
                    <span>Patrimonio Neto al Cierre</span>
                    <span className="text-zinc-200">{formatMoney(calculationResult?.patrimonioCierreTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Resultado Impositivo Neto (Pérdida)</span>
                    <span className="text-zinc-200">{formatMoney(calculationResult && calculationResult.resultadoImpositivoNeto.isNegative() ? calculationResult.resultadoImpositivoNeto.abs() : new Decimal(0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gastos comerciales No Deducibles</span>
                    <span className="text-zinc-200">{formatMoney((data?.purchases || []).filter((p) => !p.isDeductible && !p.isExempt).reduce((sum, p) => sum + Number(p.netAmount || 0), 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Excedentes Deducciones Generales (Tope)</span>
                    <span className="text-zinc-200">{formatMoney(calculationResult?.deduccionesGenerales.totalExcedenteDeduccionesGeneralesJvp)}</span>
                  </div>
                  {calculationResult && calculationResult.resultadoAjustePorInflacion.isPositive() && (
                    <div className="flex justify-between">
                      <span>AXI Impositivo (Ganancia - Erogación teórica)</span>
                      <span className="text-zinc-200">{formatMoney(calculationResult.resultadoAjustePorInflacion)}</span>
                    </div>
                  )}
                  {(data?.otherJustifications || []).filter((j) => Number(j.column) === 1).map((j, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] pl-2 border-l border-zinc-900">
                      <span>{j.concept} <span className="text-zinc-650">[Manual]</span></span>
                      <span className="text-zinc-200">{formatMoney(j.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-teal-400 font-bold border-t border-zinc-900 pt-1">
                    <span>(+) Monto Consumido (Por diferencia)</span>
                    <span>{formatMoney(calculationResult?.consumoDiferencial)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-zinc-800 font-extrabold text-white text-xs mt-3">
                    <span>Total Aplicaciones (Columna I balanceada)</span>
                    <span>{formatMoney(calculationResult?.jvpTotalColumnaI)}</span>
                  </div>
                </div>
              </div>
              <div className="print-keep p-4 rounded-lg bg-[#121216] border border-zinc-850 flex flex-col justify-center print:p-2">
                <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider mb-2">Fórmula de Cuadre del Consumo:</span>
                <div className="font-mono text-xs text-zinc-300 space-y-1 bg-zinc-950/40 p-3 rounded border border-zinc-900">
                  <p className="pl-4">  {formatMoney(calculationResult?.jvpTotalColumnaII)} <span className="text-zinc-650">[Total Recursos Col II]</span></p>
                  <p className="pl-2">- {formatMoney(calculationResult ? new Decimal(calculationResult.jvpTotalColumnaI).sub(calculationResult.consumoDiferencial) : new Decimal(0))} <span className="text-red-400">[Subtotal Erogaciones Col I sin Consumo]</span></p>
                  <div className="border-t border-zinc-800 my-1"></div>
                  <p className="font-bold text-teal-400">= {formatMoney(calculationResult?.consumoDiferencial)} <span className="text-zinc-550">[Monto Consumido Resultante]</span></p>
                </div>
              </div>
            </section>

            {/* 6. SOPORTE DE ESCALA DEL IMPUESTO */}
            <section className="p-6 rounded-xl bg-[#09090b] border border-zinc-805 space-y-4 print:p-3 print:space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">6. Soporte de Cálculo del Impuesto (Escala Art. 94)</h3>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Fórmula: Impuesto Fijo + (Ganancia Neta - Excedente) * Alícuota</span>
                </div>
                <DollarSign className="h-5 w-5 text-teal-400" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2 text-xs font-mono text-zinc-400">
                  <div className="flex justify-between py-1 border-b border-zinc-900">
                    <span>Base Imponible (Ganancia Neta Sujeta a Impuesto)</span>
                    <span className="text-zinc-200">{formatMoney(baseImponible)}</span>
                  </div>
                  {appliedBracket ? (
                    <>
                      <div className="flex justify-between py-1 border-b border-zinc-900">
                        <span>(-) Límite Inferior del Tramo (Excedente de)</span>
                        <span className="text-red-400">-{formatMoney(appliedBracket.excessOf)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-900 text-teal-400">
                        <span>(=) Excedente Imponible</span>
                        <span>{formatMoney(Decimal.max(baseImponible.sub(appliedBracket.excessOf), new Decimal(0)))}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-900">
                        <span>(x) Alícuota del Tramo (Porcentaje)</span>
                        <span className="text-zinc-200">{(new Decimal(appliedBracket.percentage).mul(new Decimal(appliedBracket.percentage).gt(1) ? 1 : 100)).toNumber()}%</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-900 text-teal-400">
                        <span>(=) Impuesto Variable sobre Excedente</span>
                        <span>{formatMoney(Decimal.max(baseImponible.sub(appliedBracket.excessOf), new Decimal(0)).mul(new Decimal(appliedBracket.percentage).gt(1) ? new Decimal(appliedBracket.percentage).div(100) : new Decimal(appliedBracket.percentage)))}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-zinc-900 text-teal-400">
                        <span>(+) Importe Impositivo Fijo del Tramo</span>
                        <span>{formatMoney(appliedBracket.fixedAmount)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="py-2 text-zinc-650">No aplica escala impositiva progresiva (Base imponible &lt;= 0).</div>
                  )}
                  <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white text-sm">
                    <span>Impuesto Determinado Final</span>
                    <span>{formatMoney(impuestoDeterminado)}</span>
                  </div>
                </div>
                <div className="print-keep p-4 rounded-lg bg-[#121216] border border-zinc-850 flex flex-col justify-center print:p-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-550 tracking-wider mb-2">Trazabilidad Escala:</span>
                  <div className="font-mono text-xs text-zinc-300 space-y-1 bg-zinc-950/40 p-3 rounded border border-zinc-900">
                    {appliedBracket ? (
                      <>
                        <p className="pl-4">  {Number(appliedBracket.fixedAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-zinc-650">[Impuesto Fijo]</span></p>
                        <p className="pl-2">+ ( {baseImponible.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-zinc-655">[Ganancia]</span></p>
                        <p className="pl-6">- {Number(appliedBracket.excessOf).toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-red-400">[Excedente]</span> )</p>
                        <p className="pl-2">x {new Decimal(appliedBracket.percentage).gt(1) ? new Decimal(appliedBracket.percentage).div(100).toNumber().toFixed(2) : new Decimal(appliedBracket.percentage).toNumber().toFixed(2)} <span className="text-teal-400">[Alícuota]</span></p>
                        <div className="border-t border-zinc-800 my-1"></div>
                        <p className="font-bold text-white">= {impuestoDeterminado.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span className="text-zinc-500">[Impuesto Determinado]</span></p>
                      </>
                    ) : (
                      <p className="text-zinc-600">Base Imponible nula o negativa. Impuesto = $0,00</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        <FiscalDocumentFooter
          documentLabel="Papel de Trabajo Determinativo — Impuesto a las Ganancias"
          disclaimer="Documento de trabajo profesional de uso interno del estudio. Respalda la determinación practicada y no reemplaza a la declaración jurada presentada ante ARCA ni a sus formularios oficiales."
          taxReturnVersion={version}
          parameterSet={taxParams?.parameterSet}
        />

      </article>

    </div>
  );
}
