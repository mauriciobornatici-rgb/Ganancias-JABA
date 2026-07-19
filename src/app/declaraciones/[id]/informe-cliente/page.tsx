'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft, 
  Printer, 
  FileText,
  Building,
  User,
  Calendar,
  Percent,
} from 'lucide-react';
import { Decimal } from 'decimal.js';
import { calculateTaxReturn } from '@/domain/ganancias/calculations/determinacionImpuesto';
import { buildTaxReturnCalculationInput } from '@/domain/ganancias/mappers/calculationInputMapper';
import { sumDeductibleNonCostPurchases } from '@/domain/ganancias/presentation/purchaseBreakdown';
import {
  TaxReturnStatusBadge,
  FiscalDocumentWatermark,
  FiscalDocumentFooter,
  type FiscalDocumentParameterSet,
} from '../fiscalDocumentChrome';

type ReportPurchase = NonNullable<Parameters<typeof sumDeductibleNonCostPurchases>[0]>[number];

type ReportDeclarationData = Record<string, unknown> & {
  clientName?: string;
  cuit?: string;
  fiscalYear?: number;
  mainActivity?: string;
  status?: string;
  version?: number;
  updatedAt?: string;
  taxParameterSetId?: string | null;
  purchases?: ReportPurchase[];
};

type ReportTaxParams = Record<string, unknown> & {
  parameterSet?: FiscalDocumentParameterSet | null;
};

export default function InformeClientePage() {
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<ReportDeclarationData | null>(null);
  const [taxParams, setTaxParams] = useState<ReportTaxParams | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    const loadReport = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const declarationResponse = await fetch(`/api/declaraciones/${id}`, { signal: controller.signal });
        const declarationPayload = await declarationResponse.json();
        if (!declarationResponse.ok || !declarationPayload.success || !declarationPayload.data) {
          throw new Error(declarationPayload.error || 'No se pudo cargar la declaración.');
        }

        const declaration = declarationPayload.data as ReportDeclarationData;
        if (!declaration.taxParameterSetId) {
          throw new Error('La DDJJ no tiene una versión normativa asociada. No es seguro emitir el informe.');
        }

        const parameterResponse = await fetch(
          `/api/parametros?year=${declaration.fiscalYear}&resolutionId=${declaration.taxParameterSetId}`,
          { signal: controller.signal },
        );
        const parameterPayload = await parameterResponse.json();
        if (!parameterResponse.ok || !parameterPayload.success || !parameterPayload.data?.parameterSet) {
          throw new Error(parameterPayload.error || 'No se pudo cargar la normativa usada por la DDJJ.');
        }

        setData(declaration);
        setTaxParams(parameterPayload.data);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'No se pudo preparar el informe.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadReport();
    return () => controller.abort();
  }, [id]);

  const calculationState = React.useMemo(() => {
    if (!data || !taxParams) return { result: null, error: null };
    try {
      const calculationInput = buildTaxReturnCalculationInput(data, taxParams);
      return { result: calculateTaxReturn(calculationInput), error: null };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : 'El cálculo de la DDJJ no pudo completarse.',
      };
    }
  }, [data, taxParams]);
  const calculationResult = calculationState.result;

  // Variables calculadas de cabecera
  const clientName = data ? data.clientName : '';
  const cuit = data ? data.cuit : '';
  const year = data ? data.fiscalYear : 2025;
  const updatedAt = data ? data.updatedAt : '';

  // Resúmenes de montos
  const ventasGravadas = React.useMemo(() => calculationResult ? calculationResult.ventasGravadas : new Decimal(0), [calculationResult]);
  const ventasExentas = calculationResult ? calculationResult.ventasExentas : new Decimal(0);
  const totalIngresos = ventasGravadas.plus(ventasExentas);
  const costoVentas = calculationResult ? calculationResult.costoVentas : new Decimal(0);
  const amortizaciones = calculationResult ? calculationResult.amortizacionesBienesDeUso : new Decimal(0);
  
  const gastosComerciales = React.useMemo(() => {
    if (calculationResult) return calculationResult.gastosDeducibles;
    return sumDeductibleNonCostPurchases(data?.purchases || []);
  }, [calculationResult, data]);

  
  const mni = calculationResult ? calculationResult.deduccionesPersonales.minimoNoImponible : new Decimal(0);
  const deduccionEspecial = calculationResult ? calculationResult.deduccionesPersonales.deduccionEspecial.plus(calculationResult.deduccionesPersonales.deduccionEspecialDoceavaParte || 0) : new Decimal(0);
  const cargasFamilia = calculationResult ? calculationResult.deduccionesPersonales.conyuge.plus(calculationResult.deduccionesPersonales.hijos).plus(calculationResult.deduccionesPersonales.hijosIncapacitados) : new Decimal(0);
  const totalDeduccionesPersonales = mni.plus(deduccionEspecial).plus(cargasFamilia);

  const baseImponible = calculationResult ? calculationResult.gananciaNetaSujetaImpuesto : new Decimal(0);
  const impuestoDeterminado = React.useMemo(() => calculationResult ? calculationResult.impuestoDeterminado : new Decimal(0), [calculationResult]);
  const retencionesYPercepciones = calculationResult ? calculationResult.retencionesYPercepciones : new Decimal(0);
  const saldoFinal = calculationResult ? calculationResult.impuestoAPagarOARCA : new Decimal(0);

  const anticipos = calculationResult ? calculationResult.anticiposSiguientePeriodo : [];

  // Alícuota Efectiva = (Impuesto Determinado / Ingresos Gravados) * 100
  const alicuotaEfectiva = React.useMemo(() => {
    if (!ventasGravadas.isZero() && impuestoDeterminado) {
      return impuestoDeterminado.div(ventasGravadas).mul(100).toNumber().toFixed(2);
    }
    return '0.00';
  }, [ventasGravadas, impuestoDeterminado]);

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
          <h3 className="text-base font-bold text-white">Preparando Informe Ejecutivo</h3>
          <p className="text-zinc-400 text-xs">Consolidando métricas comerciales y gráficos financieros...</p>
        </div>
      </div>
    );
  }

  const blockingError = loadError || calculationState.error || (!data ? 'No hay datos disponibles para emitir el informe.' : null);
  if (blockingError) {
    return (
      <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center p-6">
        <section role="alert" className="max-w-lg rounded-xl border border-red-500/40 bg-red-950/20 p-6 space-y-4">
          <h1 className="text-lg font-bold">El informe no puede emitirse</h1>
          <p className="text-sm text-red-100">{blockingError}</p>
          <p className="text-xs text-zinc-400">No se muestran importes sustitutos ni valores en cero. Corregí la DDJJ o su normativa y volvé a intentarlo.</p>
          <Link href={`/declaraciones/${id}/papel-de-trabajo`} className="inline-flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-teal-200">
            <ArrowLeft className="h-4 w-4" /> Volver al papel de trabajo
          </Link>
        </section>
      </main>
    );
  }

  // Composición para gráfico apilado
  const totalEgresosTotal = costoVentas.plus(gastosComerciales).plus(amortizaciones);
  const utilidadComercial = totalIngresos.minus(totalEgresosTotal);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-sans antialiased selection:bg-teal-500/25 selection:text-teal-200 p-6 md:p-12 print:bg-white print:text-black">
      
      {/* CONTROLES NAVEGACIÓN Y ACCIÓN */}
      <div className="max-w-4xl mx-auto flex items-center justify-between mb-8 print:hidden">
        <Link 
          href={`/declaraciones/${id}/papel-de-trabajo`}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Ver Papel de Trabajo Contable
        </Link>
        
        <button 
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-5 h-10 rounded-lg bg-teal-500 hover:bg-teal-400 text-[#09090b] font-bold text-xs uppercase tracking-wider transition-all shadow-lg hover:shadow-teal-500/20 active:scale-[0.98]"
        >
          <Printer className="h-4 w-4 stroke-[2.5]" />
          Descargar PDF / Imprimir
        </button>
      </div>

      {/* REPORTE PRINCIPAL */}
      <article className="print-fiscal-doc max-w-4xl mx-auto bg-[#121216] border border-zinc-800 rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden print:border-0 print:bg-white print:p-0 print:shadow-none">

        <FiscalDocumentWatermark status={data?.status} />

        {/* ENCABEZADO RESUMIDO */}
        <header className="relative z-10 border-b border-[#1e1e24] pb-8 mb-8 print:border-black print:pb-6 print:mb-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg bg-white p-1.5 print:p-0 print:rounded-none">
                <Image src="/logo-jaba-color.jpg" alt="JABA Dirección y Gestión" width={1064} height={946} className="h-14 w-auto print:h-16" priority />
              </div>
              <span className="text-[10px] uppercase tracking-wider block text-teal-400 font-bold print:text-black">Estudio Impositivo Contable</span>
            </div>
            <TaxReturnStatusBadge status={data?.status} />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <span className="text-[10px] uppercase tracking-widest text-teal-400 font-extrabold block print:text-black">Informe Ejecutivo</span>
              <h1 className="text-3xl font-black tracking-tight text-white print:text-black">Liquidación de Ganancias</h1>
              <p className="text-zinc-400 text-xs print:text-zinc-650">Resumen y estado de situación fiscal para el contribuyente.</p>
            </div>

            <div className="p-4 rounded-xl bg-[#09090b] border border-zinc-805 text-right font-mono print:border-black print:bg-white print:text-black">
              <span className="text-zinc-500 block uppercase font-bold text-[8px] print:text-zinc-600">Ejercicio Fiscal</span>
              <span className="text-teal-400 font-extrabold text-2xl print:text-black">{year}</span>
            </div>
          </div>
        </header>

        {/* FICHA DEL CONTRIBUYENTE */}
        <section className="print-keep grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 p-6 rounded-xl bg-[#09090b] border border-zinc-805 print:border-black print:bg-white print:text-black print:p-3 print:mb-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-teal-400 print:text-black stroke-[2.5]" />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block print:text-zinc-600">Razón Social / Titular</span>
                <span className="text-sm font-bold text-white print:text-black">{clientName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-teal-400 print:text-black stroke-[2.5]" />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold block print:text-zinc-600">CUIT Registrado</span>
                <span className="text-sm font-mono font-bold text-white print:text-black">{cuit}</span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Building className="h-4 w-4 text-teal-400 print:text-black stroke-[2.5]" />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-zinc-550 font-bold block print:text-zinc-600">Actividad Principal</span>
                <span className="text-sm font-bold text-white print:text-black">{data?.mainActivity || 'Actividad Comercial General'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-teal-400 print:text-black stroke-[2.5]" />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-zinc-550 font-bold block print:text-zinc-600">
                  {data?.status === 'Cerrada' || data?.status === 'Presentada' ? 'Fecha de Cierre' : 'Última Modificación'}
                </span>
                <span className="text-sm font-bold text-white print:text-black">
                  {updatedAt ? new Date(updatedAt).toLocaleDateString('es-AR') : '—'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* MÉTRICAS FINANCIERAS CLAVE (TARJETAS GRANDES) */}
        <section className="print-keep grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 print:grid-cols-3 print:gap-3 print:mb-4">
          
          <div className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col justify-between print:border-black print:bg-white print:p-4">
            <div>
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block print:text-zinc-600">Ingresos Totales</span>
              <span className="text-2xl font-black text-white mt-1 block print:text-black">
                ${totalIngresos.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-2 block print:text-zinc-600">Gravado + Exento</span>
          </div>

          <div className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col justify-between print:border-black print:bg-white print:p-4">
            <div>
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold block print:text-zinc-600">Costo y Amortizaciones</span>
              <span className="text-2xl font-black text-red-400 mt-1 block print:text-black">
                -${totalEgresosTotal.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 mt-2 block print:text-zinc-600">Erogaciones comerciales</span>
          </div>

          <div className="p-6 rounded-xl bg-teal-950/20 border border-teal-500/20 flex flex-col justify-between print:border-black print:bg-white print:p-4">
            <div>
              <span className="text-[9px] uppercase tracking-widest text-teal-400 font-bold block print:text-zinc-600">Utilidad del Negocio</span>
              <span className="text-2xl font-black text-teal-400 mt-1 block print:text-black">
                ${utilidadComercial.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-[10px] text-teal-500 mt-2 block print:text-zinc-600">Rentabilidad comercial</span>
          </div>

        </section>

        {/* COMPOSICIÓN GRÁFICA VISUAL (COMPORTAMIENTO FINANCIERO) */}
        <section className="print-keep mb-10 p-6 rounded-xl bg-zinc-900/30 border border-zinc-850/50 print:border-black print:bg-white print:p-3 print:mb-4">
          <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest mb-4 print:text-black">Análisis de Estructura de Ingresos y Egresos</h3>
          
          {/* Stacked progress bar */}
          <div className="space-y-4">
            {(() => { const safeTotal = totalIngresos.isZero() ? new Decimal(1) : totalIngresos; return (
            <>
            <div className="h-6 w-full rounded-lg bg-zinc-800 overflow-hidden flex print:border print:border-black">
              <div className="print-seg-1 h-full bg-teal-500" style={{ width: `${Math.max(5, (utilidadComercial.toNumber() / safeTotal.toNumber()) * 100)}%` }} title="Utilidad"></div>
              <div className="print-seg-2 h-full bg-red-400" style={{ width: `${Math.max(5, (costoVentas.plus(gastosComerciales).toNumber() / safeTotal.toNumber()) * 100)}%` }} title="Gastos Operativos"></div>
              <div className="print-seg-3 h-full bg-indigo-500" style={{ width: `${Math.max(5, (amortizaciones.toNumber() / safeTotal.toNumber()) * 100)}%` }} title="Amortización de Capital"></div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <div className="print-seg-1 h-3 w-3 rounded bg-teal-500 print:border print:border-black"></div>
                <span className="text-zinc-400 print:text-black">Utilidad: {(utilidadComercial.toNumber() / safeTotal.toNumber() * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="print-seg-2 h-3 w-3 rounded bg-red-400 print:border print:border-black"></div>
                <span className="text-zinc-400 print:text-black">Gastos: {((costoVentas.plus(gastosComerciales).toNumber()) / safeTotal.toNumber() * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="print-seg-3 h-3 w-3 rounded bg-indigo-500 print:border print:border-black"></div>
                <span className="text-zinc-400 print:text-black">Amortización: {(amortizaciones.toNumber() / safeTotal.toNumber() * 100).toFixed(0)}%</span>
              </div>
            </div>
            </>
            ); })()}
          </div>
        </section>

        {/* DETALLE TRIBUTARIO PARA EL CLIENTE */}
        <section className="print-keep grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 print:grid-cols-2 print:gap-5 print:mb-4">
          
          <div className="space-y-4">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 print:text-black print:border-black">Deducciones Personales Computadas</h3>
            <p className="text-xs text-zinc-400 leading-relaxed print:text-zinc-700">
              Las deducciones personales representan el mínimo vital libre de impuestos según la composición de tu grupo familiar y regímenes declarados:
            </p>
            
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-500 print:text-zinc-750">Mínimo No Imponible (MNI)</span>
                <span className="text-zinc-200 print:text-black">${mni.toNumber().toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-500 print:text-zinc-750">Cargas Familiares Computables</span>
                <span className="text-zinc-200 print:text-black">${cargasFamilia.toNumber().toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-500 print:text-zinc-750">Deducción Especial del Ejercicio</span>
                <span className="text-zinc-200 print:text-black">${deduccionEspecial.toNumber().toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                <span className="font-sans">Total Franquicias Impositivas</span>
                <span>${totalDeduccionesPersonales.toNumber().toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 print:text-black print:border-black">Determinación del Impuesto de Cierre</h3>
            <p className="text-xs text-zinc-400 leading-relaxed print:text-zinc-700">
              Resumen de la carga fiscal neta a liquidar ante la AFIP (ex ARCA) descontando los créditos impositivos anuales:
            </p>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-500 print:text-zinc-750">Utilidad Comercial Sujeta a Impuesto</span>
                <span className="text-zinc-200 print:text-black">${baseImponible.toNumber().toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-500 print:text-zinc-750">Impuesto AFIP Determinado (Escala Art. 94)</span>
                <span className="text-zinc-200 print:text-black">${impuestoDeterminado.toNumber().toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black text-emerald-400 print:text-black">
                <span className="text-zinc-550 print:text-zinc-750">(-) Retenciones de Tarjetas y Bancos</span>
                <span>-${retencionesYPercepciones.toNumber().toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between py-2.5 border-t border-zinc-800 font-black text-white print:text-black print:border-black text-sm bg-zinc-900/20 px-3 rounded">
                <span className="font-sans">Saldo de Impuesto a Liquidar</span>
                <span className={saldoFinal.isNegative() ? 'text-emerald-400' : 'text-white print:text-black'}>
                  ${saldoFinal.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

        </section>

        {/* ALÍCUOTA EFECTIVA GRÁFICO CIRCULAR SVG */}
        <section className="print-keep mb-10 p-6 rounded-xl bg-[#09090b] border border-zinc-805 grid grid-cols-1 md:grid-cols-3 gap-6 items-center print:border-black print:bg-white print:p-3 print:mb-4">
          <div className="md:col-span-2 space-y-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2 print:text-black">
              <Percent className="h-4 w-4 text-teal-400 print:text-black" />
              Alícuota Impositiva Efectiva Real
            </h4>
            <p className="text-xs text-zinc-400 leading-normal print:text-zinc-750">
              Tu alícuota efectiva representa el porcentaje real del impuesto sobre tus ingresos totales gravados anuales. Gracias al cómputo de deducciones familiares y especiales, tu alícuota es de un <strong className="text-teal-400 print:text-black">{alicuotaEfectiva}%</strong>, significativamente inferior a la tasa marginal nominal teórica del 35%.
            </p>
          </div>
          
          <div className="flex justify-center">
            {/* SVG Donut Chart */}
            <div className="relative h-28 w-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="print-donut-track text-zinc-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-teal-500"
                  strokeDasharray={`${alicuotaEfectiva}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute font-mono font-black text-base text-white print:text-black">
                {alicuotaEfectiva}%
              </div>
            </div>
          </div>
        </section>

        {/* CRONOGRAMA DE ANTICIPOS (EJERCICIO SIGUIENTE) */}
        <section className="print-keep space-y-3 mb-10 print:mb-4">
          <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
            <span>Proyección y Calendario de Anticipos Obligatorios</span>
            <span className="text-[10px] font-mono text-zinc-400">Cinco Vencimientos 20%</span>
          </h3>
          <p className="text-xs text-zinc-400 leading-normal print:text-zinc-700">
            La AFIP (ex ARCA) exige el ingreso de 5 anticipos mensuales a cuenta del impuesto correspondiente al próximo período fiscal. Mantenerlos al día previene la acumulación de intereses resarcitorios:
          </p>

          <div className="print-keep grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 print:grid-cols-5">
            {anticipos.map((ant, idx) => {
              // Simular meses de vencimiento tradicionales
              const meses = ['Agosto', 'Octubre', 'Diciembre', 'Febrero', 'Abril'];
              return (
                <div key={idx} className="p-4 rounded-xl bg-[#09090b] border border-zinc-805 text-center flex flex-col justify-between print:border-black print:bg-white print:text-black">
                  <span className="text-[9px] text-zinc-550 font-bold block mb-1 uppercase print:text-zinc-650">Cuota {idx + 1}</span>
                  <span className="font-mono font-extrabold text-sm text-white print:text-black">${ant.toNumber().toLocaleString('es-AR')}</span>
                  <span className="text-[8px] font-semibold text-teal-400 block mt-2 print:text-zinc-650">{meses[idx]}</span>
                </div>
              );
            })}
          </div>
        </section>

        <FiscalDocumentFooter
          documentLabel="Informe Ejecutivo — Liquidación de Ganancias"
          disclaimer="Informe de cortesía elaborado para el contribuyente sobre la base de la documentación aportada. No reemplaza a la declaración jurada presentada ante ARCA ni a sus formularios oficiales."
          taxReturnVersion={data?.version}
          parameterSet={taxParams?.parameterSet}
          showRecipientSignature
        />

      </article>
    </div>
  );
}
