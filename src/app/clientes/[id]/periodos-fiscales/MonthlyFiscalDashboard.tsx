'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, FilePlus2, MapPin, RefreshCw, ScanLine, ShieldAlert, TrendingUp } from 'lucide-react';
import { buildMonthlyDashboardState } from '@/domain/ganancias/fiscalLedger/monthlyFiscalDashboardState';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

type Settlement = {
  status: 'DRAFT' | 'IN_REVIEW' | 'READY_TO_FILE' | 'FILED_EXTERNALLY' | 'CLOSED' | 'ANNULLED';
  amountDue?: string | number | null;
  totalBalance?: string | number | null;
  officialAmount?: string | number | null;
};

type FiscalPeriod = {
  id: string;
  year: number;
  month: number;
  taxProfile: {
    vatCondition: string;
    grossIncomeRegime: string;
    conventionRegime: string;
  };
  vatSettlements: Settlement[];
  grossIncomeSettlements: Settlement[];
  _count: { documents: number };
};

type FiscalLedgerResponse = {
  success: boolean;
  error?: string;
  data?: {
    client: { id: string; cuit: string; name: string; fiscalCondition: string; mainActivity: string };
    periods: FiscalPeriod[];
  };
};

function hasOfficialDifference(settlement: Settlement | undefined, calculated: string | number | null | undefined): boolean {
  if (settlement?.officialAmount === null || settlement?.officialAmount === undefined) return false;
  return Number(settlement.officialAmount) !== Number(calculated ?? 0);
}

function humanizeStatus(status: string | null): string {
  if (!status) return 'Sin liquidar';
  return {
    DRAFT: 'Borrador',
    IN_REVIEW: 'En revision',
    READY_TO_FILE: 'Lista para presentar',
    FILED_EXTERNALLY: 'Presentada',
    CLOSED: 'Cerrada',
    ANNULLED: 'Anulada',
  }[status] ?? status;
}

export default function MonthlyFiscalDashboard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<FiscalLedgerResponse['data']>();
  const [year, setYear] = useState(2025);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, startCreating] = useTransition();
  const [creatingMonth, setCreatingMonth] = useState<number | null>(null);

  const loadPeriods = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/clientes/${clientId}/fiscal-periods`, { cache: 'no-store' });
      const payload = await response.json() as FiscalLedgerResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'No se pudo cargar el libro fiscal mensual.');
      }
      setData(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el libro fiscal mensual.');
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPeriods();
    });
  }, [loadPeriods]);

  const periodsByMonth = useMemo(() => new Map(
    (data?.periods ?? [])
      .filter(period => period.year === year)
      .map(period => [period.month, period]),
  ), [data?.periods, year]);

  const createPeriod = (month: number) => {
    setCreatingMonth(month);
    setError(null);
    startCreating(async () => {
      try {
        const response = await fetch(`/api/clientes/${clientId}/fiscal-periods`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month }),
        });
        const payload = await response.json() as { success: boolean; error?: string };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'No se pudo crear el periodo mensual.');
        }
        await loadPeriods();
      } catch (creationError) {
        setError(creationError instanceof Error ? creationError.message : 'No se pudo crear el periodo mensual.');
      } finally {
        setCreatingMonth(null);
      }
    });
  };

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-col gap-5 border-b border-dashed border-zinc-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:text-teal-300">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al padrón
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-400 text-[#09090b]">
                <CalendarDays className="h-5 w-5 stroke-[2.5]" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-400">Libro fiscal mensual</p>
                <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">IVA + IIBB</h1>
              </div>
            </div>
            {data?.client ? (
              <p className="mt-3 text-sm text-zinc-400">
                <span className="font-semibold text-zinc-200">{data.client.name}</span> <span className="font-mono text-zinc-500">{data.client.cuit}</span>
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#121216] p-3 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500" htmlFor="fiscal-year">Ejercicio</label>
            <input
              id="fiscal-year"
              type="number"
              min="2020"
              max="2100"
              value={year}
              onChange={event => setYear(Number(event.target.value) || 2025)}
              className="h-9 w-20 rounded border border-zinc-700 bg-zinc-950 px-2 text-center font-mono text-sm font-bold text-teal-300 outline-none transition-colors focus:border-teal-400"
            />
            <button
              type="button"
              onClick={() => void loadPeriods()}
              disabled={isLoading}
              className="inline-flex h-9 w-9 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-50"
              aria-label="Actualizar periodos"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href={`/clientes/${clientId}/consolidacion-anual`}
              className="inline-flex h-9 items-center gap-2 rounded border border-teal-500/40 bg-teal-500/10 px-3 text-xs font-bold text-teal-300 transition-colors hover:bg-teal-500/20"
            >
              <TrendingUp className="h-4 w-4" /> Reporte anual
            </Link>
            <Link
              href={`/clientes/${clientId}/iibb-config`}
              className="inline-flex h-9 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-teal-500/50 hover:text-teal-300"
            >
              <MapPin className="h-4 w-4" /> Config. IIBB
            </Link>
          </div>
        </div>

        <section className="rounded-xl border border-teal-500/20 bg-teal-500/[0.06] px-5 py-4">
          <p className="text-sm font-semibold text-teal-200">Pantalla de prueba del modulo mensual</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">Cree los meses que vaya a trabajar. Cada alta queda vinculada al perfil fiscal vigente al cierre del mes y no modifica la declaracion anual de Ganancias.</p>
        </section>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4 text-sm text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <section aria-label="Periodos mensuales" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MONTHS.map((monthName, index) => {
            const month = index + 1;
            const period = periodsByMonth.get(month);
            const vat = period?.vatSettlements[0];
            const grossIncome = period?.grossIncomeSettlements[0];
            const dashboardState = period ? buildMonthlyDashboardState({
              id: period.id,
              month,
              vatStatus: vat?.status ?? null,
              grossIncomeStatus: grossIncome?.status ?? null,
              documentCount: period._count.documents,
              hasOfficialDifference: hasOfficialDifference(vat, vat?.amountDue) || hasOfficialDifference(grossIncome, grossIncome?.totalBalance),
            }) : null;

            return (
              <article key={month} className="min-h-52 rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl transition-colors hover:border-zinc-700">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{String(month).padStart(2, '0')} / {year}</p>
                    <h2 className="mt-1 text-lg font-extrabold text-white">{monthName}</h2>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    dashboardState?.tone === 'success' ? 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-300' :
                    dashboardState?.tone === 'warning' ? 'border border-amber-400/25 bg-amber-400/10 text-amber-200' :
                    'border border-zinc-700 bg-zinc-900 text-zinc-400'
                  }`}>
                    {dashboardState?.status ?? 'Sin crear'}
                  </span>
                </div>

                {period && dashboardState ? (
                  <div className="mt-5 space-y-2 border-t border-zinc-800 pt-4 text-xs">
                    <p className="flex justify-between gap-4 text-zinc-400"><span>Comprobantes</span><strong className="font-mono text-zinc-200">{period._count.documents}</strong></p>
                    <p className="flex justify-between gap-4 text-zinc-400"><span>IVA</span><strong className="text-zinc-200">{humanizeStatus(vat?.status ?? null)}</strong></p>
                    <p className="flex justify-between gap-4 text-zinc-400"><span>IIBB</span><strong className="text-zinc-200">{humanizeStatus(grossIncome?.status ?? null)}</strong></p>
                    <p className="pt-1 text-[10px] uppercase tracking-wider text-zinc-500">{period.taxProfile.grossIncomeRegime.replaceAll('_', ' ')}</p>
                    {dashboardState.alerts.map(alert => <p key={alert} className="text-xs leading-5 text-amber-200">{alert}</p>)}
                  </div>
                ) : (
                  <p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-500">Cree el periodo para iniciar la importacion de comprobantes, la revision de IVA y la liquidacion de IIBB.</p>
                )}

                {!period ? (
                  <button
                    type="button"
                    onClick={() => createPeriod(month)}
                    disabled={isCreating}
                    className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-teal-400 px-3 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:cursor-wait disabled:opacity-60"
                  >
                    <FilePlus2 className="h-4 w-4" /> {creatingMonth === month ? 'Creando...' : 'Crear periodo'}
                  </button>
                ) : (
                  <Link
                    href={`/clientes/${clientId}/periodos-fiscales/${period.id}/liquidacion-iva`}
                    className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-teal-400 px-3 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300"
                  >
                    <ScanLine className="h-4 w-4" /> Liquidar IVA
                  </Link>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
