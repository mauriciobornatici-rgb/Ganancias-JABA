'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Printer, 
  Sparkles, 
  CheckCircle, 
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
import { TaxReturnCalculationInput } from '@/domain/ganancias/types';
import { downloadTaxReturnExcel } from '@/domain/ganancias/exports/excelGenerator';

export default function PapelDeTrabajoPage() {
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
        .catch(err => console.error("Error al obtener papel de trabajo de base de datos:", err))
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
      console.error("Error executing dynamic calculation for papel de trabajo:", e);
      return null;
    }
  }, [data, taxParams]);

  // Variables calculadas
  const clientName = data ? data.clientName : '';
  const cuit = data ? data.cuit : '';
  const year = data ? data.fiscalYear : 2025;
  const is2024 = year === 2024;
  const mainActivity = data ? data.mainActivity : '';
  const status = data ? data.status : 'Borrador';
  const version = data ? data.version : 0;
  const updatedAt = data ? data.updatedAt : '';
  
  const ventasGravadas = calculationResult ? calculationResult.ventasGravadas : new Decimal(0);
  const ventasExentas = calculationResult ? calculationResult.ventasExentas : new Decimal(0);
  const costoVentas = calculationResult ? calculationResult.costoVentas : new Decimal(0);
  const amortizaciones = calculationResult ? calculationResult.amortizacionesBienesDeUso : new Decimal(0);

  // Gastos deducibles generales cargados del wizard
  const gastosComerciales = React.useMemo(() => {
    if (!data?.purchases) return new Decimal(0);
    return data.purchases
      .filter((p: any) => p.isDeductible)
      .reduce((sum: Decimal, p: any) => sum.plus(new Decimal(p.netAmount || 0)), new Decimal(0));
  }, [data]);

  const resultadoComercialNeto = calculationResult ? calculationResult.resultadoComercialNeto : new Decimal(0);

  const mni = calculationResult ? calculationResult.deduccionesPersonales.minimoNoImponible : new Decimal(0);
  const deduccionEspecial = calculationResult ? calculationResult.deduccionesPersonales.deduccionEspecial : new Decimal(0);
  const cargasFamilia = calculationResult ? calculationResult.deduccionesPersonales.conyuge.plus(calculationResult.deduccionesPersonales.hijos).plus(calculationResult.deduccionesPersonales.hijosIncapacitados) : new Decimal(0);
  const deduccionesGenerales = calculationResult ? calculationResult.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas : new Decimal(0);
  
  const totalDeducciones = mni.plus(deduccionEspecial).plus(cargasFamilia).plus(deduccionesGenerales);
  const baseImponible = calculationResult ? calculationResult.gananciaNetaSujetaImpuesto : new Decimal(0);
  const impuestoDeterminado = calculationResult ? calculationResult.impuestoDeterminado : new Decimal(0);
  
  const appliedBracket = React.useMemo(() => {
    if (!taxParams?.brackets || !baseImponible) return null;
    return taxParams.brackets.find((b: any) => {
      const fromVal = new Decimal(b.fromAmount);
      const toVal = b.toAmount ? new Decimal(b.toAmount) : null;
      return baseImponible.gt(fromVal) && (toVal === null || baseImponible.lte(toVal));
    }) || taxParams.brackets[0] || null;
  }, [taxParams, baseImponible]);

  const retenciones = calculationResult ? calculationResult.retencionesYPercepciones : new Decimal(0);
  const saldoAFavorAnterior = calculationResult ? calculationResult.saldoAFavorAnterior : new Decimal(0);
  const totalPagosACuenta = retenciones.plus(saldoAFavorAnterior);
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
            onClick={() => downloadTaxReturnExcel(data, calculationResult)}
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
      <article className="max-w-5xl mx-auto bg-[#121216] border border-zinc-800 rounded-2xl p-8 md:p-12 shadow-2xl relative overflow-hidden print:border-0 print:bg-white print:p-0 print:shadow-none">
        
        {/* Marca de agua / Badge Cerrada */}
        <div className="absolute top-6 right-6 flex items-center gap-2 print:top-0 print:right-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest print:border-black print:text-black">
            <CheckCircle className="h-3.5 w-3.5" />
            Cerrada e Inmutable
          </span>
        </div>

        {/* ENCABEZADO CORPORATIVO */}
        <header className="border-b border-[#1e1e24] pb-8 mb-8 print:border-black">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center print:hidden">
              <Sparkles className="h-5.5 w-5.5 text-[#09090b]" />
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-teal-200 to-zinc-100 bg-clip-text text-transparent block print:text-black print:bg-none">JABA</span>
              <span className="text-[10px] uppercase tracking-wider block text-teal-400 font-bold -mt-1 print:text-black">Estudio Impositivo Contable</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white print:text-black">Papel de Trabajo Determinativo</h1>
              <p className="text-zinc-400 text-xs mt-1 print:text-black">Impuesto a las Ganancias de Personas Humanas y Sucesiones Indivisas.</p>
              <div className="flex gap-4 mt-3 text-xs text-zinc-500 font-mono print:text-black">
                <span>Versión: DDJJ Original (v{version})</span>
                <span>•</span>
                <span>Cierre: {updatedAt ? new Date(updatedAt).toLocaleDateString('es-AR') : ''}</span>
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

        {/* FICHA CONTRIBUYENTE */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 p-6 rounded-xl bg-[#09090b] border border-zinc-805 print:border-black print:bg-white print:text-black">
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

        {/* DESGLOSE DETERMINATIVO POR APARTADOS */}
        <div className="space-y-8">
          
          {/* APARTADO I: CATEGORÍA DE GANANCIAS */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
              <span>Apartado I: Rentas de la Tercera Categoría (Comerciales)</span>
              <span className="text-[10px] font-mono text-zinc-400">Determinación Cedular</span>
            </h3>
            
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-400 print:text-black">Facturación Gravada Anual (Ventas)</span>
                <span className="text-zinc-200 font-bold print:text-black">${ventasGravadas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black text-emerald-400 print:text-black">
                <span className="text-zinc-450 print:text-black">Facturación Exenta / Monotributo</span>
                <span>${ventasExentas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">(-) Costo de Mercaderías y Materiales</span>
                <span className="text-red-400 print:text-black">-${costoVentas.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">(-) Gastos de Estructura y Estáticos</span>
                <span className="text-red-400 print:text-black">-${gastosComerciales.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                <span className="font-sans">Resultado de la Categoría Comercial</span>
                <span>${resultadoComercialNeto.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </section>

          {/* APARTADO II: DEDUCCIONES ADMITIDAS */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
              <span>Apartado II: Deducciones Personales y Mínimos (Art. 30)</span>
              <span className="text-[10px] font-mono text-zinc-400">Topes Aplicados 2024/2025</span>
            </h3>
            
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-400 print:text-black">Mínimo No Imponible (MNI)</span>
                <span className="text-red-400 print:text-black">-${mni.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">Deducción Especial (Art. 30 Inc. C)</span>
                <span className="text-red-400 print:text-black">-${deduccionEspecial.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">Cargas de Familia (Cónyuge e Hijos)</span>
                <span className="text-red-400 print:text-black">-${cargasFamilia.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">Deducciones Generales Admitidas (Seguros/Educativos)</span>
                <span className="text-red-400 print:text-black">-${deduccionesGenerales.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2 border-t border-zinc-800 font-bold text-white print:text-black print:border-black text-sm">
                <span className="font-sans">Total Erogaciones Deducibles</span>
                <span>-${totalDeducciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </section>

          {/* APARTADO III: ESCALA ARTÍCULO 94 */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
              <span>Apartado III: Determinación de la Base Imponible y Alícuota</span>
              <span className="text-[10px] font-mono text-zinc-400">Escala de Tramos Art. 94</span>
            </h3>
            
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-400 print:text-black">Ganancia Neta Comercial</span>
                <span className="text-zinc-200 print:text-black">${resultadoComercialNeto.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">(-) Total Erogaciones y Deducciones Computadas</span>
                <span className="text-red-400 print:text-black">-${totalDeducciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
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
          <section className="space-y-3">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
              <span>Apartado IV: Retenciones, Percepciones y Saldo de Impuesto</span>
              <span className="text-[10px] font-mono text-zinc-400">Mis Retenciones AFIP</span>
            </h3>
            
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-400 print:text-black">Impuesto a las Ganancias Determinado Anual</span>
                <span className="text-zinc-200 font-bold print:text-black">${impuestoDeterminado.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">(-) Retenciones y Percepciones Computables</span>
                <span className="text-emerald-400 print:text-black">-${retenciones.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-850/30 print:border-black">
                <span className="text-zinc-450 print:text-black">(-) Saldo a Favor del Período Anterior</span>
                <span className="text-emerald-400 print:text-black">-${saldoAFavorAnterior.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 border-t border-zinc-800 font-black text-white print:text-black print:border-black text-sm bg-zinc-900/20 px-3 rounded">
                <span className="font-sans">Saldo Determinado (Saldo a Pagar al Fisco / A Favor)</span>
                <span className={saldoFinal.isNegative() ? 'text-emerald-400' : 'text-white print:text-black'}>
                  ${saldoFinal.toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </section>

          {/* APARTADO V: PROYECCIÓN DE ANTICIPOS */}
          <section className="space-y-3 print:break-before-page">
            <h3 className="text-xs uppercase font-extrabold text-teal-400 tracking-widest border-b border-zinc-800 pb-2 flex items-center justify-between print:text-black print:border-black">
              <span>Apartado V: Proyección de Anticipos Impositivos (Siguiente Período)</span>
              <span className="text-[10px] font-mono text-zinc-400">Cinco Cuotas 20%</span>
            </h3>
            
            <p className="text-zinc-550 text-xs print:text-black">
              Los anticipos se liquidan y vencen de forma mensual e indexada para mitigar el devengamiento de intereses resarcitorios:
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 text-center">
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

        {/* SECCIÓN DE FIRMAS Y VALIDEZ (PRINT ONLY) */}
        <section className="hidden print:grid grid-cols-2 gap-12 mt-20 pt-12 border-t border-black text-center text-xs text-black">
          <div>
            <div className="h-[60px]"></div>
            <div className="border-t border-dashed border-black pt-2 mx-12">
              <span className="font-bold block">{clientName}</span>
              <span className="text-[10px] text-zinc-650 block">Firma del Contribuyente</span>
            </div>
          </div>
          <div>
            <div className="h-[60px]"></div>
            <div className="border-t border-dashed border-black pt-2 mx-12">
              <span className="font-bold block">JABA Contabilidad</span>
              <span className="text-[10px] text-zinc-650 block">Firma y Sello del Profesional</span>
            </div>
          </div>
        </section>

      </article>
      
    </div>
  );
}
