'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Printer, 
  Sparkles, 
  CheckCircle, 
  DollarSign, 
  FileText,
  Building,
  User,
  Calendar,
  ShieldCheck,
  Percent,
  CalendarDays,
  FileSpreadsheet
} from 'lucide-react';
import { Decimal } from 'decimal.js';
import { calculateTaxReturn } from '@/domain/ganancias/calculations/determinacionImpuesto';
import { TaxReturnCalculationInput } from '@/domain/ganancias/types';

export default function InformeClientePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [taxParams, setTaxParams] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetch(`/api/declaraciones/${id}`)
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data) {
            setData(res.data);
            if (res.data.taxParameterSetId) {
              fetch(`/api/parametros?year=${res.data.fiscalYear}&resolutionId=${res.data.taxParameterSetId}`)
                .then(r => r.json())
                .then(pRes => {
                  if (pRes.success && pRes.data) {
                    setTaxParams(pRes.data);
                  }
                });
            }
          }
        })
        .catch(err => console.error("Error al obtener datos de liquidación para el cliente:", err))
        .finally(() => setIsLoading(false));
    }
  }, [id]);

  const calculationResult = React.useMemo(() => {
    if (!data || !taxParams) return null;
    try {
      const calculationInput: TaxReturnCalculationInput = {
        clientName: data.clientName,
        cuit: data.cuit,
        fiscalYear: data.fiscalYear,
        params: {
          year: data.fiscalYear,
          deduccionesArt30: {
            minimoNoImponible: new Decimal(taxParams.minimoNoImponible || 0),
            conyuge: new Decimal(taxParams.conyuge || 0),
            hijo: new Decimal(taxParams.hijo || 0),
            hijoIncapacitado: new Decimal(taxParams.hijoIncapacitado || 0),
            especialAutonomo: new Decimal(taxParams.especialAutonomo || 0),
            especialEmprendedor: new Decimal(taxParams.especialEmprendedor || 0),
            especialDependiente: new Decimal(taxParams.especialDependiente || 0),
          },
          topesDeduccionesGenerales: {
            topeServicioDomestico: new Decimal(taxParams.topeServicioDomestico || 0),
            topeSeguroVida: new Decimal(taxParams.topeSeguroVida || 0),
            topeSeguroRetiro: new Decimal(taxParams.topeSeguroRetiro || 0),
            topeGastosSepelio: new Decimal(taxParams.topeGastosSepelio || 0),
            topeInteresHipoteca: new Decimal(taxParams.topeInteresHipoteca || 0),
            topeGastosEducativos: new Decimal(taxParams.topeGastosEducativos || 0),
          },
          escalaArt94: (taxParams.brackets || []).map((b: any) => ({
            fromAmount: new Decimal(b.fromAmount),
            toAmount: b.toAmount ? new Decimal(b.toAmount) : null,
            fixedAmount: new Decimal(b.fixedAmount),
            percentage: new Decimal(b.percentage),
            excessOf: new Decimal(b.excessOf),
          })),
          indicesIPC: (taxParams.ipcIndices || []).map((i: any) => ({
            monthIndex: i.monthIndex,
            ipcValue: new Decimal(i.ipcValue),
          })),
        },
        sales: (data.sales || []).map((s: any) => ({
          date: new Date(s.date),
          netAmount: new Decimal(s.netAmount || 0),
          isExempt: s.isExempt || false
        })),
        purchases: (data.purchases || []).map((p: any) => ({
          date: new Date(p.date),
          netAmount: new Decimal(p.netAmount || 0),
          isDeductible: p.isDeductible !== false,
          isExempt: p.isExempt || false,
          expenseType: p.expenseType || 'GastosGenerales'
        })),
        fixedAssets: (data.fixedAssets || []).map((a: any) => ({
          id: a.id,
          name: a.name || '',
          type: a.type || 'Otro',
          purchaseDate: new Date(a.purchaseDate || new Date()),
          originalCost: new Decimal(a.originalCost || 0),
          usefulLife: Number(a.usefulLife || 10),
          yearsElapsed: Number(a.yearsElapsed || 0),
          customReexpIndex: new Decimal(a.customReexpIndex || 1.0)
        })),
        inventories: [
          { concept: 'Bienes de Cambio', initialStock: new Decimal(data.initialStock || 0), finalStock: new Decimal(data.finalStock || 0) }
        ],
        bankAccounts: (data.bankAccounts || []).map((b: any) => ({
          id: b.id,
          nominalInitial: new Decimal(b.nominalInitial || 0),
          nominalFinal: new Decimal(b.nominalFinal || 0),
          tcInitial: new Decimal(b.tcInitial || 1.0),
          tcFinal: new Decimal(b.tcFinal || 1.0),
          interests: new Decimal(b.interests || 0)
        })),
        cashHoldings: [],
        receivables: [],
        liabilities: [],
        withholdings: (data.withholdings || []).map((w: any) => ({
          amount: new Decimal(w.amount || 0),
          taxCode: w.taxCode || 'Ganancias'
        })),
        generalDeductions: [
          {
            autonomos: new Decimal(data.generalDeductions?.autonomos || 0),
            servicioDomestico: new Decimal(data.generalDeductions?.servicioDomestico || 0),
            seguroVida: new Decimal(data.generalDeductions?.seguroVida || 0),
            seguroRetiro: new Decimal(data.generalDeductions?.seguroRetiro || 0),
            gastosSepelio: new Decimal(data.generalDeductions?.gastosSepelio || 0),
            interesesHipoteca: new Decimal(data.generalDeductions?.interesesHipoteca || 0),
            gastosEducativos: new Decimal(data.generalDeductions?.gastosEducativos || 0),
            alquilerCasaHabitacion: new Decimal(data.generalDeductions?.alquilerCasaHabitacion || 0),
            donaciones: new Decimal(data.generalDeductions?.donaciones || 0),
            medicosAsistencial: new Decimal(data.generalDeductions?.medicosAsistencial || 0),
            honorariosMedicos: new Decimal(data.generalDeductions?.honorariosMedicos || 0),
          }
        ],
        personalDeductions: {
          tieneConyuge: data.personalDeductions?.tieneConyuge || false,
          cantidadHijos: data.personalDeductions?.cantidadHijos || 0,
          cantidadHijosIncapacitados: data.personalDeductions?.cantidadHijosIncapacitados || 0,
          tipoDeduccionEspecial: data.personalDeductions?.tipoDeduccionEspecial || 'Ninguna',
          esJubiladoOchoHaberes: data.personalDeductions?.esJubiladoOchoHaberes || false,
        },
        personalAssets: (data.personalAssets || []).map((a: any) => ({
          description: a.description || '',
          type: a.type || 'Otros',
          valueInitial: new Decimal(a.valueInitial || 0),
          valueFinal: new Decimal(a.valueFinal || 0)
        })),
        personalLiabilities: [],
        otherJustifications: [],
        axiStatic: {
          activoTotalInicio: new Decimal(data.activoTotalInicio || 0),
          bienesNoComputablesInicio: new Decimal(data.bienesNoComputablesInicio || 0),
          pasivoTotalInicio: new Decimal(data.pasivoTotalInicio || 0),
        },
        axiDynamic: [],
        saldoAFavorAnterior: new Decimal(data.saldoAFavorAnterior || 0),
        quebrantosAnteriores: new Decimal(data.quebrantosAnteriores || 0),
      };
      return calculateTaxReturn(calculationInput);
    } catch (e) {
      console.error("Error executing dynamic calculation for client report:", e);
      return null;
    }
  }, [data, taxParams]);

  // Variables calculadas de cabecera
  const clientName = data ? data.clientName : '';
  const cuit = data ? data.cuit : '';
  const year = data ? data.fiscalYear : 2025;
  const status = data ? data.status : 'Borrador';
  const updatedAt = data ? data.updatedAt : '';

  // Resúmenes de montos
  const ventasGravadas = calculationResult ? calculationResult.ventasGravadas : new Decimal(0);
  const ventasExentas = calculationResult ? calculationResult.ventasExentas : new Decimal(0);
  const totalIngresos = ventasGravadas.plus(ventasExentas);
  const costoVentas = calculationResult ? calculationResult.costoVentas : new Decimal(0);
  const amortizaciones = calculationResult ? calculationResult.amortizacionesBienesDeUso : new Decimal(0);
  
  const gastosComerciales = React.useMemo(() => {
    if (!data?.purchases) return new Decimal(0);
    return data.purchases
      .filter((p: any) => p.isDeductible)
      .reduce((sum: Decimal, p: any) => sum.plus(new Decimal(p.netAmount || 0)), new Decimal(0));
  }, [data]);

  const totalDeduccionesGenerales = calculationResult ? calculationResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas : new Decimal(0);
  
  const mni = calculationResult ? calculationResult.deduccionesPersonales.minimoNoImponible : new Decimal(0);
  const deduccionEspecial = calculationResult ? calculationResult.deduccionesPersonales.deduccionEspecial : new Decimal(0);
  const cargasFamilia = calculationResult ? calculationResult.deduccionesPersonales.conyuge.plus(calculationResult.deduccionesPersonales.hijos).plus(calculationResult.deduccionesPersonales.hijosIncapacitados) : new Decimal(0);
  const totalDeduccionesPersonales = mni.plus(deduccionEspecial).plus(cargasFamilia);

  const baseImponible = calculationResult ? calculationResult.gananciaNetaSujetaImpuesto : new Decimal(0);
  const impuestoDeterminado = calculationResult ? calculationResult.impuestoDeterminado : new Decimal(0);
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
      <article className="max-w-4xl mx-auto bg-[#121216] border border-zinc-800 rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden print:border-0 print:bg-white print:p-0 print:shadow-none">
        
        {/* ENCABEZADO RESUMIDO */}
        <header className="border-b border-[#1e1e24] pb-8 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 print:border-black print:pb-6 print:mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2 print:hidden">
              <ShieldCheck className="h-5 w-5 text-teal-400" />
              <span className="text-[10px] uppercase tracking-widest text-teal-400 font-extrabold">Informe Ejecutivo</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white print:text-black">Liquidación de Ganancias</h1>
            <p className="text-zinc-400 text-xs print:text-zinc-650">Resumen y estado de situación fiscal para el contribuyente.</p>
          </div>

          <div className="p-4 rounded-xl bg-[#09090b] border border-zinc-805 text-right font-mono print:border-black print:bg-white print:text-black">
            <span className="text-zinc-500 block uppercase font-bold text-[8px] print:text-zinc-600">Ejercicio Fiscal</span>
            <span className="text-teal-400 font-extrabold text-2xl print:text-black">{year}</span>
          </div>
        </header>

        {/* FICHA DEL CONTRIBUYENTE */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 p-6 rounded-xl bg-[#09090b] border border-zinc-805 print:border-black print:bg-white print:text-black print:p-4">
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
                <span className="text-[9px] uppercase tracking-wider text-zinc-550 font-bold block print:text-zinc-600">Fecha de Cierre</span>
                <span className="text-sm font-bold text-white print:text-black">
                  {updatedAt ? new Date(updatedAt).toLocaleDateString('es-AR') : 'Original'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* MÉTRICAS FINANCIERAS CLAVE (TARJETAS GRANDES) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 print:grid-cols-3 print:gap-4 print:mb-8">
          
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
        <section className="mb-10 p-6 rounded-xl bg-zinc-900/30 border border-zinc-850/50 print:border-black print:bg-white print:p-4">
          <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest mb-4 print:text-black">Análisis de Estructura de Ingresos y Egresos</h3>
          
          {/* Stacked progress bar */}
          <div className="space-y-4">
            {(() => { const safeTotal = totalIngresos.isZero() ? new Decimal(1) : totalIngresos; return (
            <>
            <div className="h-6 w-full rounded-lg bg-zinc-800 overflow-hidden flex print:border print:border-black">
              <div className="h-full bg-teal-500" style={{ width: `${Math.max(5, (utilidadComercial.toNumber() / safeTotal.toNumber()) * 100)}%` }} title="Utilidad"></div>
              <div className="h-full bg-red-400" style={{ width: `${Math.max(5, (costoVentas.plus(gastosComerciales).toNumber() / safeTotal.toNumber()) * 100)}%` }} title="Gastos Operativos"></div>
              <div className="h-full bg-indigo-500" style={{ width: `${Math.max(5, (amortizaciones.toNumber() / safeTotal.toNumber()) * 100)}%` }} title="Amortización de Capital"></div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-teal-500 print:border print:border-black"></div>
                <span className="text-zinc-400 print:text-black">Utilidad: {(utilidadComercial.toNumber() / safeTotal.toNumber() * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-red-400 print:border print:border-black"></div>
                <span className="text-zinc-400 print:text-black">Gastos: {((costoVentas.plus(gastosComerciales).toNumber()) / safeTotal.toNumber() * 100).toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-indigo-500 print:border print:border-black"></div>
                <span className="text-zinc-400 print:text-black">Amortización: {(amortizaciones.toNumber() / safeTotal.toNumber() * 100).toFixed(0)}%</span>
              </div>
            </div>
            </>
            ); })()}
          </div>
        </section>

        {/* DETALLE TRIBUTARIO PARA EL CLIENTE */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 print:grid-cols-2 print:gap-6 print:mb-8">
          
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
        <section className="mb-10 p-6 rounded-xl bg-[#09090b] border border-zinc-805 grid grid-cols-1 md:grid-cols-3 gap-6 items-center print:border-black print:bg-white print:p-4">
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
                  className="text-zinc-800"
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
        <section className="space-y-3 mb-10 print:break-before-page">
          <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
            <span>Proyección y Calendario de Anticipos Obligatorios</span>
            <span className="text-[10px] font-mono text-zinc-400">Cinco Vencimientos 20%</span>
          </h3>
          <p className="text-xs text-zinc-400 leading-normal print:text-zinc-700">
            La AFIP (ex ARCA) exige el ingreso de 5 anticipos mensuales a cuenta del impuesto correspondiente al próximo período fiscal. Mantenerlos al día previene la acumulación de intereses resarcitorios:
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2">
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

        {/* NOTA PROFESIONAL DE SEGURIDAD */}
        <footer className="border-t border-[#1e1e24] pt-8 text-xs text-zinc-500 leading-relaxed space-y-4 print:border-black print:text-black print:pt-6">
          <p>
            * Este informe ejecutivo ha sido procesado mediante el motor tributario auditado JABA, reexpresando activos fijos y conciliando variaciones patrimoniales según los parámetros establecidos por la Ley N° 20.628 de Impuesto a las Ganancias y modificatorias vigentes al cierre.
          </p>
          
          <div className="hidden print:grid grid-cols-2 gap-12 pt-16 text-center text-black">
            <div>
              <div className="h-[50px]"></div>
              <div className="border-t border-dashed border-black pt-2 mx-12">
                <span className="font-bold block">{clientName}</span>
                <span className="text-[9px] text-zinc-650 block">Firma y Aceptación</span>
              </div>
            </div>
            <div>
              <div className="h-[50px]"></div>
              <div className="border-t border-dashed border-black pt-2 mx-12">
                <span className="font-bold block">Estudio Contable JABA</span>
                <span className="text-[9px] text-zinc-650 block">Profesional Responsable</span>
              </div>
            </div>
          </div>
        </footer>

      </article>
    </div>
  );
}
