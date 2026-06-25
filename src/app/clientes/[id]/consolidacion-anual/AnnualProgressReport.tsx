'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, ShieldAlert, TrendingUp, CalendarCheck, AlertTriangle } from 'lucide-react';

const MONTHS = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type Totals = {
  salesNet: string; salesExempt: string; inventoryPurchases: string; deductibleExpenses: string;
  fixedAssetPurchases: string; nonDeductibleExpenses: string; vatNonComputable: string; grossIncomeTax: string;
};

type ReportData = {
  client: { id: string; name: string; cuit: string };
  year: number;
  gate: {
    usableMonths: number[];
    blockedMonths: Array<{ month: number; reason: string }>;
    canConsolidateYear: boolean;
    warnings: string[];
  };
  usedMonths: number[];
  pendingReviewByMonth: Array<{ month: number; pending: number }>;
  consolidation: { sourceHash: string; warnings: string[]; totals: Totals; periods: Array<{ month: number } & Totals> } | null;
};

const ARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : ARS.format(Number(v)));

export default function AnnualProgressReport({ clientId }: { clientId: string }) {
  const [year, setYear] = useState(2025);
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/consolidacion-anual?year=${year}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo cargar la consolidación anual.');
      setData(payload.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la consolidación anual.');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, year]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const t = data?.consolidation?.totals;
  // Margen bruto PROVISORIO (orientativo): ventas gravadas − mercadería − gastos deducibles − IIBB.
  // No es el resultado impositivo final (faltan amortizaciones, AXI, inventario, deducciones).
  const margenProvisorio = useMemo(() => {
    if (!t) return null;
    return Number(t.salesNet) - Number(t.inventoryPurchases) - Number(t.deductibleExpenses) - Number(t.grossIncomeTax);
  }, [t]);

  const usable = new Set(data?.gate.usableMonths ?? []);

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex flex-col gap-5 border-b border-dashed border-zinc-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href={`/clientes/${clientId}/periodos-fiscales`} className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:text-teal-300">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al libro mensual
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-400 text-[#09090b]"><TrendingUp className="h-5 w-5 stroke-[2.5]" /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-400">Avance anual a hoy</p>
                <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{data?.client?.name ?? 'Consolidación'}</h1>
                {data?.client ? <p className="mt-1 font-mono text-xs text-zinc-500">{data.client.cuit}</p> : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#121216] p-3 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500" htmlFor="year">Ejercicio</label>
            <input id="year" type="number" min="2020" max="2100" value={year} onChange={e => setYear(Number(e.target.value) || 2025)} className="h-9 w-20 rounded border border-zinc-700 bg-zinc-950 px-2 text-center font-mono text-sm font-bold text-teal-300 outline-none focus:border-teal-400" />
            <button type="button" onClick={() => void load()} disabled={isLoading} className="inline-flex h-9 w-9 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-50" aria-label="Actualizar">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4 text-sm text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p>
          </div>
        ) : null}

        {/* Estado de los meses */}
        <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-white"><CalendarCheck className="h-4 w-4" /> Meses cotejados</h2>
          <p className="mt-1 text-xs text-zinc-500">Solo los meses con IVA cerrado/cotejado (verde) alimentan este reporte. Los grises todavía no están cerrados.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {MONTHS.slice(1).map((m, i) => {
              const month = i + 1;
              const on = usable.has(month);
              return (
                <span key={month} className={`rounded px-2.5 py-1 text-[11px] font-bold ${on ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border border-zinc-700 bg-zinc-900 text-zinc-500'}`}>{m}</span>
              );
            })}
          </div>
          {data && !data.gate.canConsolidateYear ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.gate.warnings[0] ?? 'Faltan meses por cotejar para el año completo.'}</p>
          ) : data?.gate.canConsolidateYear ? (
            <p className="mt-3 text-xs text-emerald-300">Año completo: los 12 meses están cotejados. Listo para liquidar.</p>
          ) : null}
        </section>

        {/* Acumulado por categoría */}
        {t ? (
          <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
            <h2 className="text-sm font-extrabold text-white">Acumulado del ejercicio (a hoy)</h2>
            <p className="mt-1 text-xs text-zinc-500">Netos sin IVA, según lo cargado en los meses cotejados. El IVA es neutro en Ganancias.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-400">Ingresos</p>
                <Line label="Ventas gravadas" value={t.salesNet} strong />
                <Line label="Ventas exentas / no gravadas" value={t.salesExempt} />
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-400">Egresos</p>
                <Line label="Compras de mercadería" value={t.inventoryPurchases} />
                <Line label="Gastos deducibles" value={t.deductibleExpenses} />
                <Line label="Bienes de uso (altas)" value={t.fixedAssetPurchases} muted />
                <Line label="IIBB del período" value={t.grossIncomeTax} />
                <Line label="IVA no computable (a costo)" value={t.vatNonComputable} muted />
              </div>
            </div>

            {margenProvisorio !== null ? (
              <div className="mt-4 rounded-lg border border-teal-500/25 bg-teal-500/[0.06] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Margen bruto provisorio</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-zinc-400">Orientativo: ventas gravadas − mercadería − gastos − IIBB. NO es el impuesto final (faltan amortizaciones, inventario, AXI y deducciones personales).</p>
                  </div>
                  <strong className={`shrink-0 font-mono text-xl ${margenProvisorio >= 0 ? 'text-teal-300' : 'text-red-300'}`}>{fmt(margenProvisorio)}</strong>
                </div>
              </div>
            ) : null}

            {/* Detalle por mes */}
            {data?.consolidation?.periods?.length ? (
              <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-zinc-950/90 text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-1.5">Mes</th>
                        <th className="px-2 py-1.5 text-right">Ventas grav.</th>
                        <th className="px-2 py-1.5 text-right">Mercadería</th>
                        <th className="px-2 py-1.5 text-right">Gastos</th>
                        <th className="px-2 py-1.5 text-right">IIBB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.consolidation.periods.slice().sort((a, b) => a.month - b.month).map(p => (
                        <tr key={p.month} className="border-t border-zinc-900">
                          <td className="px-3 py-1.5 font-bold text-zinc-300">{MONTHS[p.month]}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmt(p.salesNet)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(p.inventoryPurchases)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(p.deductibleExpenses)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(p.grossIncomeTax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {data?.pendingReviewByMonth?.length ? (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Hay compras con imputación inferida pendiente de confirmar (mercadería vs gasto vs bien de uso) en: {data.pendingReviewByMonth.map(p => MONTHS[p.month]).join(', ')}.
              </p>
            ) : null}
          </section>
        ) : !isLoading ? (
          <section className="rounded-xl border border-dashed border-zinc-700 bg-[#121216] p-8 text-center text-sm text-zinc-500">
            Todavía no hay meses cotejados para {year}. Cerrá al menos un mes de IVA para ver el avance.
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <p className={`flex justify-between gap-4 py-1 text-sm ${muted ? 'text-zinc-500' : 'text-zinc-300'}`}>
      <span>{label}</span>
      <strong className={`font-mono ${strong ? 'text-zinc-100' : 'text-zinc-300'}`}>{fmt(value)}</strong>
    </p>
  );
}
