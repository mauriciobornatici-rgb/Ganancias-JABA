'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Plus, Trash2, Save, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

type JurRow = {
  jurisdictionCode: string;
  registrationNumber: string;
  taxRatePct: string; // alícuota como % (lo que ve el usuario)
  unifiedCoefficient: string; // para CM
  isActive: boolean;
};

type ConfigData = {
  client: { id: string; name: string; cuit: string };
  year: number;
  vatCondition: string;
  regime: string;
  conventionRegime: string;
  hasProfile: boolean;
  jurisdictions: Array<{ jurisdictionCode: string; registrationNumber: string | null; taxRate: string | null; isActive: boolean }>;
  coefficients: Array<{ jurisdictionCode: string; unifiedCoefficient: string }>;
};

const VAT_CONDITIONS = ['RESPONSABLE_INSCRIPTO', 'EXENTO', 'MONOTRIBUTO', 'OTRO'];
const GI_REGIMES = ['NONE', 'ARBA_LOCAL', 'ARBA_SIMPLIFICADO', 'CM_REGIMEN_GENERAL', 'CM_REGIMEN_ESPECIAL'];
const CONVENTION_REGIMES = ['NONE', 'GENERAL', 'ESPECIAL'];

const REGIME_LABEL: Record<string, string> = {
  NONE: 'No liquida IIBB',
  ARBA_LOCAL: 'Local (ARBA / una jurisdicción)',
  ARBA_SIMPLIFICADO: 'Régimen simplificado (ARBA)',
  CM_REGIMEN_GENERAL: 'Convenio Multilateral — Régimen General',
  CM_REGIMEN_ESPECIAL: 'Convenio Multilateral — Régimen Especial',
};

export default function IibbConfigEditor({ clientId }: { clientId: string }) {
  const [year, setYear] = useState(2025);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [rows, setRows] = useState<JurRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Formulario de perfil fiscal (condición IVA + régimen IIBB + Convenio)
  const [pVat, setPVat] = useState('RESPONSABLE_INSCRIPTO');
  const [pRegime, setPRegime] = useState('NONE');
  const [pConvention, setPConvention] = useState('NONE');
  const [savingProfile, setSavingProfile] = useState(false);

  const isConvenio = config?.regime === 'CM_REGIMEN_GENERAL' || config?.regime === 'CM_REGIMEN_ESPECIAL';

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/iibb-config?year=${year}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo cargar la configuración.');
      const data: ConfigData = payload.data;
      setConfig(data);
      setPVat(data.vatCondition);
      setPRegime(data.regime);
      setPConvention(data.conventionRegime);
      const coefMap = new Map(data.coefficients.map(c => [c.jurisdictionCode, c.unifiedCoefficient]));
      setRows(
        data.jurisdictions.map(j => ({
          jurisdictionCode: j.jurisdictionCode,
          registrationNumber: j.registrationNumber ?? '',
          taxRatePct: j.taxRate != null ? (Number(j.taxRate) * 100).toString() : '',
          unifiedCoefficient: coefMap.get(j.jurisdictionCode) ?? '',
          isActive: j.isActive,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración.');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, year]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const coefSum = useMemo(
    () => rows.filter(r => r.isActive).reduce((s, r) => s + (Number(r.unifiedCoefficient) || 0), 0),
    [rows],
  );
  const coefOk = Math.abs(coefSum - 1) <= 0.0001;

  const addRow = () => setRows(prev => [...prev, { jurisdictionCode: '', registrationNumber: '', taxRatePct: '', unifiedCoefficient: '', isActive: true }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<JurRow>) => setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const saveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/tax-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatCondition: pVat, grossIncomeRegime: pRegime, conventionRegime: pConvention }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo guardar el perfil.');
      setNotice('Perfil fiscal guardado. Ya podés crear períodos y configurar las jurisdicciones de IIBB.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      // Una fila con datos (alícuota/coef/inscripción) pero SIN código se descartaría en silencio:
      // lo avisamos para que no parezca que "se guardó y desapareció".
      const rowsConData = rows.filter(r => r.taxRatePct.trim() || r.unifiedCoefficient.trim() || r.registrationNumber.trim());
      const sinCodigo = rowsConData.filter(r => !r.jurisdictionCode.trim());
      if (sinCodigo.length > 0) {
        setError('Cada jurisdicción necesita un código (ej. 902). Completá el código de las filas cargadas antes de guardar.');
        setSaving(false);
        return;
      }

      const valid = rows.filter(r => r.jurisdictionCode.trim());
      if (valid.length === 0) {
        setError('Agregá al menos una jurisdicción con su código y alícuota antes de guardar.');
        setSaving(false);
        return;
      }

      const jurisdictions = valid.map(r => ({
        jurisdictionCode: r.jurisdictionCode.trim(),
        taxRate: r.taxRatePct.trim() === '' ? null : Number(r.taxRatePct.replace(',', '.')) / 100,
        registrationNumber: r.registrationNumber.trim() || null,
        isActive: r.isActive,
      }));
      const coefficients = isConvenio
        ? valid.filter(r => r.isActive && r.unifiedCoefficient.trim() !== '').map(r => ({ jurisdictionCode: r.jurisdictionCode.trim(), unifiedCoefficient: Number(r.unifiedCoefficient.replace(',', '.')) }))
        : undefined;

      const res = await fetch(`/api/clientes/${clientId}/iibb-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, jurisdictions, coefficients }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo guardar.');
      setNotice(`Configuración guardada: ${payload.data?.updated ?? jurisdictions.length} jurisdicción(es)${payload.data?.coefficients ? ` y ${payload.data.coefficients} coeficiente(s) CM` : ''}. Quedan cargadas abajo.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="flex flex-col gap-5 border-b border-dashed border-zinc-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href={`/clientes/${clientId}/periodos-fiscales`} className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:text-teal-300">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al libro mensual
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-400 text-[#09090b]"><MapPin className="h-5 w-5 stroke-[2.5]" /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-400">Configuración de IIBB</p>
                <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{config?.client?.name ?? 'Ingresos Brutos'}</h1>
                {config ? <p className="mt-1 text-sm text-zinc-400">{REGIME_LABEL[config.regime] ?? config.regime}</p> : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#121216] p-3 shadow-xl">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500" htmlFor="year">Año coef. CM</label>
            <input id="year" type="number" min="2020" max="2100" value={year} onChange={e => setYear(Number(e.target.value) || 2025)} className="h-9 w-20 rounded border border-zinc-700 bg-zinc-950 px-2 text-center font-mono text-sm font-bold text-teal-300 outline-none focus:border-teal-400" />
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4 text-sm text-red-200"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p></div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-5 py-4 text-sm text-emerald-200"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p></div>
        ) : null}

        {/* Perfil fiscal: condición de IVA + régimen de IIBB + Convenio */}
        <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
          <h2 className="text-sm font-extrabold text-white">Perfil fiscal</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {config && !config.hasProfile
              ? 'Este cliente todavía no tiene perfil fiscal. Cargalo para poder crear períodos y liquidar.'
              : 'Condición de IVA y régimen de Ingresos Brutos. El régimen define si se liquida IIBB y si aplica Convenio Multilateral.'}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Condición IVA</label>
              <select value={pVat} onChange={e => setPVat(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-teal-400">
                {VAT_CONDITIONS.map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Régimen IIBB</label>
              <select value={pRegime} onChange={e => setPRegime(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-teal-400">
                {GI_REGIMES.map(v => <option key={v} value={v}>{REGIME_LABEL[v] ?? v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Convenio</label>
              <select value={pConvention} onChange={e => setPConvention(e.target.value)} className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-teal-400">
                {CONVENTION_REGIMES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="mt-4 inline-flex h-10 items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:opacity-50">
            <Save className="h-4 w-4" /> {savingProfile ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </section>

        {config?.regime === 'NONE' ? (
          <div className="rounded-xl border border-zinc-800 bg-[#121216] px-5 py-4 text-sm text-zinc-400">
            El régimen de IIBB del perfil es <strong className="text-zinc-200">NONE</strong>: este contribuyente no liquida Ingresos Brutos. Cambiá el régimen en el perfil fiscal para configurar jurisdicciones.
          </div>
        ) : (
          <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-white">Jurisdicciones y alícuotas</h2>
                <p className="mt-1 text-xs text-zinc-500">Cargá la alícuota de cada jurisdicción (en %). {isConvenio ? 'Para Convenio Multilateral, también el coeficiente unificado (CM05) — deben sumar 1.' : ''}</p>
              </div>
              <button type="button" onClick={addRow} className="inline-flex h-9 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-200 hover:border-teal-500/50 hover:text-teal-300"><Plus className="h-4 w-4" /> Jurisdicción</button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-2 py-1.5">Activa</th>
                    <th className="px-2 py-1.5">Código jurisdicción</th>
                    <th className="px-2 py-1.5">N° inscripción</th>
                    <th className="px-2 py-1.5 text-right">Alícuota (%)</th>
                    {isConvenio ? <th className="px-2 py-1.5 text-right">Coef. unificado</th> : null}
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-zinc-900">
                      <td className="px-2 py-1.5"><input type="checkbox" checked={r.isActive} onChange={e => update(i, { isActive: e.target.checked })} className="h-3.5 w-3.5 accent-teal-400" /></td>
                      <td className="px-2 py-1.5"><input value={r.jurisdictionCode} onChange={e => update(i, { jurisdictionCode: e.target.value })} placeholder="902" className="h-8 w-24 rounded border border-zinc-700 bg-zinc-950 px-2 font-mono text-zinc-200 outline-none focus:border-teal-400" /></td>
                      <td className="px-2 py-1.5"><input value={r.registrationNumber} onChange={e => update(i, { registrationNumber: e.target.value })} placeholder="opcional" className="h-8 w-32 rounded border border-zinc-700 bg-zinc-950 px-2 font-mono text-zinc-300 outline-none focus:border-teal-400" /></td>
                      <td className="px-2 py-1.5 text-right"><input inputMode="decimal" value={r.taxRatePct} onChange={e => update(i, { taxRatePct: e.target.value })} placeholder="5" className="h-8 w-20 rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-zinc-200 outline-none focus:border-teal-400" /></td>
                      {isConvenio ? <td className="px-2 py-1.5 text-right"><input inputMode="decimal" value={r.unifiedCoefficient} onChange={e => update(i, { unifiedCoefficient: e.target.value })} placeholder="0.6500" className="h-8 w-24 rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-zinc-200 outline-none focus:border-teal-400" /></td> : null}
                      <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => removeRow(i)} className="text-zinc-500 hover:text-red-400" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr><td colSpan={isConvenio ? 6 : 5} className="px-2 py-6 text-center text-[11px] text-zinc-600">{isLoading ? 'Cargando…' : 'Sin jurisdicciones. Agregá una.'}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {isConvenio && rows.length > 0 ? (
              <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${coefOk ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300' : 'border-amber-500/30 bg-amber-950/20 text-amber-200'}`}>
                {coefOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                Suma de coeficientes (activas): <strong className="font-mono">{coefSum.toFixed(6)}</strong> {coefOk ? '— correcto (= 1)' : '— debe sumar 1,000000 para guardar.'}
              </div>
            ) : null}

            <div className="mt-5">
              <button type="button" onClick={() => void save()} disabled={saving || (isConvenio && rows.some(r => r.isActive && r.unifiedCoefficient.trim() !== '') && !coefOk)} className="inline-flex h-10 items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
