'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Save } from 'lucide-react';

/**
 * Tasa por Inspección de Seguridad e Higiene (TISH) - punto 2 del PDF (2026-07-24).
 *
 * Bloque propio y visible al lado de la configuración de IIBB (pedido expreso del usuario: que no
 * haya que buscarlo). Alícuota y categoría L/M/N manuales; los importes de la ordenanza quedan como
 * parámetros editables del año. La base sale de las actividades tildadas "computa TISH" arriba.
 */

type TishLine = {
  jurisdictionCode: string | null;
  activityCode: string;
  activityLabel: string | null;
  taxableBase: string;
  tax: string;
};

type TishBimesterView = {
  bimester: number;
  sourceState: 'PRELIMINARY' | 'FINAL';
  months: number[];
  dueDate: string | null;
  taxRate: string;
  lines: TishLine[];
  taxBeforeMinimum: string;
  subtotal: string;
  minimumApplied: boolean;
  healthContribution: string;
  firefightersContribution: string;
  wasteContribution: string;
  total: string;
  warnings: string[];
};

type TishSettingView = {
  category: 'L' | 'M' | 'N';
  taxRate: string;
  minimumQuota: string;
  categoryAQuota: string;
  healthRate: string;
  firefightersRate: string;
  wasteRateCategoryL: string;
  wasteRateCategoryM: string;
  wasteRateCategoryN: string;
  dueDates: string[];
  notes: string | null;
};

type TishData = {
  year: number;
  hasSetting: boolean;
  hasCompleteSetting: boolean;
  calculationState: 'NOT_APPLICABLE' | 'PROFILE_REQUIRED' | 'CONFIGURATION_REQUIRED' | 'ACTIVITY_REQUIRED' | 'PRELIMINARY' | 'READY';
  canPreview: boolean;
  canFinalize: boolean;
  parameterSource: 'SAVED' | 'REFERENCE_2026' | 'MISSING';
  vatCondition: string | null;
  profile: { id: string; validFrom: string; validTo: string | null } | null;
  monthsNotClosed: number[];
  monthsWithoutSettlement: number[];
  setting: TishSettingView;
  activities: Array<{ jurisdictionCode: string; activityCode: string; activityLabel: string | null; computesTish: boolean; isActive: boolean }>;
  bimesters: TishBimesterView[];
  totalYear: string;
  savedSettlements: Array<{
    id: string;
    bimester: number;
    version: number;
    status: string;
    total: string;
    sourceFingerprint: string;
    closedAt: string;
  }>;
  notices: string[];
};

const ARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : ARS.format(Number(value));

const MONTHS_SHORT = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthsLabel = (months: number[]) => months.map(m => MONTHS_SHORT[m] ?? m).join('-');
const pctToInput = (fraction: string) => (Number(fraction) * 100).toString();
const inputToFraction = (percent: string) => Number(percent.replace(',', '.')) / 100;
const stateLabel: Record<TishData['calculationState'], string> = {
  NOT_APPLICABLE: 'No aplicable',
  PROFILE_REQUIRED: 'Falta perfil fiscal',
  CONFIGURATION_REQUIRED: 'Falta configuración',
  ACTIVITY_REQUIRED: 'Falta actividad',
  PRELIMINARY: 'Preliquidación',
  READY: 'Fuentes cerradas',
};

export default function TishPanel({ clientId, year, refreshKey }: { clientId: string; year: number; refreshKey: number }) {
  const [data, setData] = useState<TishData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBimester, setSavingBimester] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Formulario (alícuota y porcentajes se editan en %, los importes en pesos)
  const [category, setCategory] = useState<'L' | 'M' | 'N'>('L');
  const [ratePct, setRatePct] = useState('0');
  const [minimumQuota, setMinimumQuota] = useState('40000');
  const [categoryAQuota, setCategoryAQuota] = useState('8000');
  const [healthPct, setHealthPct] = useState('12');
  const [firefightersPct, setFirefightersPct] = useState('10');
  const [wasteLPct, setWasteLPct] = useState('25');
  const [wasteMPct, setWasteMPct] = useState('40');
  const [wasteNPct, setWasteNPct] = useState('60');
  const [dueDates, setDueDates] = useState<string[]>([]);
  // Bimestre con el detalle abierto: es lo que hay que transcribir a la DDJJ.
  const [openBimester, setOpenBimester] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/tish?year=${year}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo cargar la TISH.');
      const loaded: TishData = payload.data;
      setData(loaded);
      setCategory(loaded.setting.category);
      setRatePct(pctToInput(loaded.setting.taxRate));
      setMinimumQuota(Number(loaded.setting.minimumQuota).toString());
      setCategoryAQuota(Number(loaded.setting.categoryAQuota).toString());
      setHealthPct(pctToInput(loaded.setting.healthRate));
      setFirefightersPct(pctToInput(loaded.setting.firefightersRate));
      setWasteLPct(pctToInput(loaded.setting.wasteRateCategoryL));
      setWasteMPct(pctToInput(loaded.setting.wasteRateCategoryM));
      setWasteNPct(pctToInput(loaded.setting.wasteRateCategoryN));
      setDueDates(loaded.setting.dueDates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la TISH.');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, year]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load, refreshKey]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/tish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          category,
          taxRate: inputToFraction(ratePct),
          minimumQuota: minimumQuota.replace(',', '.'),
          categoryAQuota: categoryAQuota.replace(',', '.'),
          healthRate: inputToFraction(healthPct),
          firefightersRate: inputToFraction(firefightersPct),
          wasteRateCategoryL: inputToFraction(wasteLPct),
          wasteRateCategoryM: inputToFraction(wasteMPct),
          wasteRateCategoryN: inputToFraction(wasteNPct),
          dueDates,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo guardar la TISH.');
      setNotice(`Configuración de TISH ${year} guardada. La liquidación de abajo se recalculó con estos valores.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la TISH.');
    } finally {
      setSaving(false);
    }
  };

  const closeBimester = async (bimester: number) => {
    setSavingBimester(bimester);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/tish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, bimester }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo guardar el cierre TISH.');
      }
      await load();
      setNotice(
        payload.data.deduplicated
          ? `El ${bimester}º bimestre ya estaba guardado con esas mismas fuentes (versión ${payload.data.version}).`
          : `TISH del ${bimester}º bimestre cerrada como versión ${payload.data.version}, total $${fmt(payload.data.total)}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cierre TISH.');
    } finally {
      setSavingBimester(null);
    }
  };

  const markedActivities = (data?.activities ?? []).filter(a => a.computesTish && a.isActive);

  return (
    <section className="rounded-xl border border-teal-500/25 bg-[#121216] p-5 shadow-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-white">
            <ShieldCheck className="h-4 w-4 text-teal-400" /> Tasa de Seguridad e Higiene (TISH)
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Régimen General (responsable inscripto). Se liquida por bimestre sobre la base imponible de IIBB de las
            actividades tildadas <strong className="text-zinc-300">&quot;computa TISH&quot;</strong> en la tabla de arriba.
            La alícuota del art. 23 y la categoría L/M/N se cargan a mano.
          </p>
        </div>
        {data ? (
          <div className="shrink-0 rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-teal-400">
              {data.canPreview ? `Total calculado ${data.year}` : `TISH ${data.year}`}
            </span>
            <span className="font-mono text-sm font-bold text-teal-300">
              {data.canPreview ? `$${fmt(data.totalYear)}` : 'No calculado'}
            </span>
            <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-zinc-400">
              {stateLabel[data.calculationState]}
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-red-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p>{notice}</p>
        </div>
      ) : null}
      {(data?.notices ?? []).map((item, index) => (
        <div key={index} className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-[11px] leading-5 text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{item}</p>
        </div>
      ))}
      {data?.profile ? (
        <p className="mt-3 text-[10px] text-zinc-500">
          Perfil fiscal aplicado a {year}: vigente desde {data.profile.validFrom}
          {data.profile.validTo ? ` hasta ${data.profile.validTo}` : ' sin fecha de fin'}.
        </p>
      ) : null}

      {/* Configuración manual del año */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Categoría (tramo de facturación)</label>
          <select value={category} onChange={e => setCategory(e.target.value as 'L' | 'M' | 'N')} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-teal-400">
            <option value="L">L — hasta 2 veces cat. K</option>
            <option value="M">M — entre 2 y 3 veces cat. K</option>
            <option value="N">N — más de 3 veces cat. K</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Alícuota art. 23 (%)</label>
          <input inputMode="decimal" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="0,6" className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mínimo: cuota cat. K ($)</label>
          <input inputMode="decimal" value={minimumQuota} onChange={e => setMinimumQuota(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Cuota cat. A ($)</label>
          <input inputMode="decimal" value={categoryAQuota} onChange={e => setCategoryAQuota(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Contribución Salud (%)</label>
          <input inputMode="decimal" value={healthPct} onChange={e => setHealthPct(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Bomberos (% de cuota A)</label>
          <input inputMode="decimal" value={firefightersPct} onChange={e => setFirefightersPct(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Residuos L / M / N (% de cat. K)</label>
          <div className="flex gap-2">
            <input inputMode="decimal" value={wasteLPct} onChange={e => setWasteLPct(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
            <input inputMode="decimal" value={wasteMPct} onChange={e => setWasteMPct(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
            <input inputMode="decimal" value={wasteNPct} onChange={e => setWasteNPct(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actividades que computan</label>
          <p className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-2 text-[11px] leading-4 text-zinc-400">
            {markedActivities.length === 0
              ? 'Ninguna tildada'
              : markedActivities.map(a => a.activityLabel || a.activityCode || `Jur. ${a.jurisdictionCode}`).join(', ')}
          </p>
        </div>
      </div>

      {/* Vencimientos de presentación */}
      <div className="mt-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vencimientos de presentación (6 cuotas)</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map(index => (
            <input
              key={index}
              type="date"
              value={dueDates[index] ?? ''}
              onChange={e => setDueDates(prev => {
                const next = [...prev];
                while (next.length < 6) next.push('');
                next[index] = e.target.value;
                return next;
              })}
              className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 font-mono text-xs text-zinc-200 outline-none focus:border-teal-400"
              aria-label={`Vencimiento cuota ${index + 1}`}
            />
          ))}
        </div>
      </div>

      <button type="button" onClick={() => void save()} disabled={saving} className="mt-4 inline-flex h-10 items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:opacity-50">
        <Save className="h-4 w-4" /> {saving ? 'Guardando…' : `Guardar TISH ${year}`}
      </button>

      {/* Liquidación por bimestre, con la estructura del formulario de Régimen General */}
      <div className="mt-6">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          {data?.calculationState === 'READY' ? 'Liquidación' : 'Preliquidación'} bimestral {year}
          <span className="font-normal normal-case tracking-normal text-zinc-600">
            {' '}— un bimestre es definitivo solo cuando sus dos liquidaciones de IIBB están cerradas
          </span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-2 py-1.5">Cuota</th>
                <th className="px-2 py-1.5">Meses</th>
                <th className="px-2 py-1.5">Vence</th>
                <th className="px-2 py-1.5">Estado fuente</th>
                <th className="px-2 py-1.5 text-right">Base imponible</th>
                <th className="px-2 py-1.5 text-right">Tasa</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
                <th className="px-2 py-1.5 text-right">Salud</th>
                <th className="px-2 py-1.5 text-right">Bomberos</th>
                <th className="px-2 py-1.5 text-right">Residuos</th>
                <th className="px-2 py-1.5 text-right">Total a abonar</th>
                <th className="px-2 py-1.5 text-right">Cierre TISH</th>
              </tr>
            </thead>
            <tbody>
              {(data?.bimesters ?? []).map(bimester => {
                const base = bimester.lines.reduce((sum, line) => sum + Number(line.taxableBase), 0);
                const isOpen = openBimester === bimester.bimester;
                const history = (data?.savedSettlements ?? [])
                  .filter(saved => saved.bimester === bimester.bimester);
                const latestSaved = history[0];
                return (
                  <Fragment key={bimester.bimester}>
                  <tr
                    className="border-t border-zinc-900 hover:bg-zinc-800/20"
                  >
                    <td className="px-2 py-1.5 font-bold text-zinc-200">
                      <button
                        type="button"
                        onClick={() => setOpenBimester(isOpen ? null : bimester.bimester)}
                        aria-expanded={isOpen}
                        title="Ver el detalle por actividad para completar la DDJJ"
                        className="rounded px-1 py-0.5 hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      >
                        {bimester.bimester}º
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-zinc-400">{monthsLabel(bimester.months)}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-400">{bimester.dueDate ?? '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        bimester.sourceState === 'FINAL'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-amber-500/10 text-amber-300'
                      }`}>
                        {bimester.sourceState === 'FINAL' ? 'IIBB cerrado' : 'Preliminar'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmt(base)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-300">{fmt(bimester.taxBeforeMinimum)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${bimester.minimumApplied ? 'text-amber-300' : 'text-zinc-200'}`}>
                      {fmt(bimester.subtotal)}{bimester.minimumApplied ? ' *' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(bimester.healthContribution)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(bimester.firefightersContribution)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(bimester.wasteContribution)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-teal-300">{fmt(bimester.total)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {latestSaved ? (
                        <span className="mr-2 whitespace-nowrap text-[10px] text-zinc-400">
                          v{latestSaved.version} · ${fmt(latestSaved.total)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void closeBimester(bimester.bimester)}
                        disabled={bimester.sourceState !== 'FINAL' || savingBimester !== null}
                        title={bimester.sourceState === 'FINAL'
                          ? 'Guarda una versión trazable con las fuentes IIBB cerradas'
                          : 'Cierre primero los dos meses de IIBB del bimestre'}
                        className="rounded border border-teal-500/30 px-2 py-1 text-[9px] font-bold uppercase text-teal-300 hover:bg-teal-500/10 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
                      >
                        {savingBimester === bimester.bimester ? 'Guardando…' : 'Guardar cierre'}
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-t border-zinc-900 bg-zinc-950/60">
                      <td colSpan={12} className="px-3 py-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          Detalle para la DDJJ del {bimester.bimester}º bimestre (monto imponible por actividad)
                        </p>
                        {bimester.lines.length === 0 ? (
                          <p className="text-[11px] text-zinc-400">
                            Sin base imponible de IIBB en este bimestre para las actividades tildadas. Se abona el mínimo de la categoría K.
                          </p>
                        ) : (
                          <table className="w-full text-left text-[11px]">
                            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                              <tr>
                                <th className="px-2 py-1">Período</th>
                                <th className="px-2 py-1">Cód. actividad (NAIIB 18)</th>
                                <th className="px-2 py-1">Jurisdicción</th>
                                <th className="px-2 py-1 text-right">Monto imponible</th>
                                <th className="px-2 py-1 text-right">Alícuota</th>
                                <th className="px-2 py-1 text-right">Tasa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bimester.lines.map((line, index) => (
                                <tr key={`${line.activityCode}-${index}`} className="border-t border-zinc-900">
                                  <td className="px-2 py-1 text-zinc-400">{monthsLabel(bimester.months)} {data?.year}</td>
                                  <td className="px-2 py-1 font-mono text-zinc-200">
                                    {line.activityCode || '—'}
                                    {line.activityLabel && line.activityLabel !== line.activityCode ? (
                                      <span className="ml-2 font-sans text-zinc-500">{line.activityLabel}</span>
                                    ) : null}
                                  </td>
                                  <td className="px-2 py-1 font-mono text-zinc-400">{line.jurisdictionCode ?? '—'}</td>
                                  <td className="px-2 py-1 text-right font-mono text-zinc-200">{fmt(line.taxableBase)}</td>
                                  <td className="px-2 py-1 text-right font-mono text-zinc-400">{(Number(bimester.taxRate) * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%</td>
                                  <td className="px-2 py-1 text-right font-mono text-zinc-200">{fmt(line.tax)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {bimester.warnings.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {bimester.warnings.map((warning, index) => (
                              <li key={index} className="text-[11px] leading-4 text-amber-200">· {warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
              {(!data || data.bimesters.length === 0) && (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-[11px] text-zinc-400">
                    {isLoading
                      ? 'Cargando…'
                      : 'Sin bimestres calculables. Complete el perfil, la configuración TISH, la actividad y las liquidaciones mensuales indicadas arriba.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(data?.bimesters ?? []).some(b => b.minimumApplied) ? (
          <p className="mt-2 text-[11px] text-amber-200">
            * La tasa calculada quedó por debajo del mínimo de la categoría K y se abona el mínimo.
          </p>
        ) : null}
      </div>
    </section>
  );
}
