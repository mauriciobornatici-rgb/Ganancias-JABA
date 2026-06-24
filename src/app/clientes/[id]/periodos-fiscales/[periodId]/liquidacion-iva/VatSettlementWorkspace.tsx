'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, UploadCloud, RefreshCw, ShieldAlert, CheckCircle2, AlertTriangle,
  Calculator, Save, FileSpreadsheet, ScanLine,
} from 'lucide-react';

const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type DocumentRow = {
  id: string;
  direction: 'SALE' | 'PURCHASE';
  voucherType: string;
  voucherNumber: string;
  issueDate: string;
  counterpartyName: string | null;
  counterpartyCuit: string | null;
  netAmount: string;
  totalAmount: string;
  vatAmount: string;
  includedInSettlement: boolean;
};

type PeriodInfo = { id: string; year: number; month: number };

type VatView = {
  debitFiscal: string;
  creditFiscal: string;
  technicalBalance: string;
  technicalDue: string;
  technicalCarryForward: string;
  creditsApplied: string;
  amountDue: string;
  freeAvailabilityBalance: string;
  debitByRate: Array<{ rate: string; taxableBase: string; vatAmount: string }>;
  creditByRate: Array<{ rate: string; taxableBase: string; vatAmount: string; computable: boolean }>;
};

const ARS = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : ARS.format(Number(v)));
const ratePct = (r: string) => `${(Number(r) * 100).toFixed(1).replace(/\.0$/, '')}%`;

export default function VatSettlementWorkspace({ clientId, periodId }: { clientId: string; periodId: string }) {
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settlement, setSettlement] = useState<VatView | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Cotejo contra AFIP
  const [offDebit, setOffDebit] = useState('');
  const [offCredit, setOffCredit] = useState('');
  const [offDue, setOffDue] = useState('');
  const [offRef, setOffRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ status: string; version: number } | null>(null);
  const [cotejoDiffs, setCotejoDiffs] = useState<Array<{ concept: string; app: string; official: string; diff: string }> | null>(null);
  const [canForceSave, setCanForceSave] = useState(false);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/documents`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudieron cargar los comprobantes.');
      setPeriod(payload.data.period);
      setDocuments(payload.data.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los comprobantes.');
    } finally {
      setIsLoading(false);
    }
  }, [clientId, periodId]);

  useEffect(() => { queueMicrotask(() => { void loadDocuments(); }); }, [loadDocuments]);

  const sales = useMemo(() => documents.filter(d => d.direction === 'SALE'), [documents]);
  const purchases = useMemo(() => documents.filter(d => d.direction === 'PURCHASE'), [documents]);

  const includedSalesVat = useMemo(
    () => sales.filter(d => d.includedInSettlement).reduce((s, d) => s + Number(d.vatAmount), 0),
    [sales],
  );
  const includedPurchasesVat = useMemo(
    () => purchases.filter(d => d.includedInSettlement).reduce((s, d) => s + Number(d.vatAmount), 0),
    [purchases],
  );

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    setSettlement(null);
    try {
      const form = new FormData();
      Array.from(files).forEach(f => form.append('files', f));
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/documents`, { method: 'POST', body: form });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudieron importar los archivos.');
      setNotice(`Importados ${payload.data.inserted} comprobantes nuevos (${payload.data.duplicates} duplicados omitidos).`);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron importar los archivos.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const persistSelection = useCallback(async (changes: Array<{ documentId: string; included: boolean }>) => {
    try {
      await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/documents/selection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
    } catch {
      // si falla el guardado de selección, se recarga para no quedar desincronizado
      void loadDocuments();
    }
  }, [clientId, periodId, loadDocuments]);

  const toggleRow = (id: string, included: boolean) => {
    setDocuments(prev => prev.map(d => (d.id === id ? { ...d, includedInSettlement: included } : d)));
    setSettlement(null);
    void persistSelection([{ documentId: id, included }]);
  };

  const toggleAll = (direction: 'SALE' | 'PURCHASE', included: boolean) => {
    const affected = documents.filter(d => d.direction === direction);
    setDocuments(prev => prev.map(d => (d.direction === direction ? { ...d, includedInSettlement: included } : d)));
    setSettlement(null);
    void persistSelection(affected.map(d => ({ documentId: d.id, included })));
  };

  const calculate = async () => {
    setCalculating(true);
    setError(null);
    setSaveResult(null);
    setCotejoDiffs(null);
    try {
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/settlement`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo calcular la liquidación.');
      setSettlement(payload.data.vat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo calcular la liquidación.');
    } finally {
      setCalculating(false);
    }
  };

  // Cotejo en vivo (lado cliente) para feedback inmediato antes de guardar.
  const liveCotejo = useMemo(() => {
    if (!settlement) return null;
    const checks: Array<{ concept: string; ok: boolean; app: string; official: string }> = [];
    const cmp = (concept: string, app: string, off: string) => {
      if (off.trim() === '') return;
      const offNum = Number(off.replace(/\./g, '').replace(',', '.'));
      checks.push({ concept, ok: Math.abs(Number(app) - offNum) <= 0.01, app, official: String(offNum) });
    };
    cmp('Débito fiscal', settlement.debitFiscal, offDebit);
    cmp('Crédito fiscal', settlement.creditFiscal, offCredit);
    cmp('Saldo a pagar', settlement.amountDue, offDue);
    if (checks.length === 0) return null;
    // Para cerrar hacen falta los tres importes; con menos, el cotejo está incompleto.
    const complete = offDebit.trim() !== '' && offCredit.trim() !== '' && offDue.trim() !== '';
    return { checks, complete, allOk: complete && checks.every(c => c.ok) };
  }, [settlement, offDebit, offCredit, offDue]);

  const save = async (force: boolean) => {
    if (!settlement) return;
    setCanForceSave(false);
    setSaving(true);
    setError(null);
    setCotejoDiffs(null);
    try {
      const official = (offDebit || offCredit || offDue || offRef)
        ? { debitFiscal: offDebit || null, creditFiscal: offCredit || null, amountDue: offDue || null, reference: offRef || null }
        : null;
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/settlement/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ official, forceSave: force }),
      });
      const payload = await res.json();
      if (res.status === 409) {
        setCotejoDiffs(payload.cotejo?.diffs ?? []);
        // El backend distingue cotejo incompleto (faltan importes) de cotejo con diferencias.
        setError(payload.error || 'Los valores no coinciden con AFIP. Revisá los comprobantes o guardá con observación.');
        // Solo se ofrece "guardar igual" cuando el cotejo está completo pero difiere (no si faltan importes).
        setCanForceSave(Boolean(payload.cotejo?.complete));
        return;
      }
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo guardar la liquidación.');
      setSaveResult({ status: payload.data.status, version: payload.data.version });
      // Solo una liquidación CLOSED (cotejada y coincidente) habilita su uso en Ganancias anual.
      const closed = payload.data.status === 'CLOSED';
      setNotice(
        closed
          ? `Liquidación cotejada y cerrada (versión ${payload.data.version}). Ya disponible para la liquidación anual de Ganancias.`
          : `Liquidación guardada como ${humanStatus(payload.data.status)} (versión ${payload.data.version}). Todavía NO alimenta Ganancias: cotejá los tres importes con AFIP y cerrala para habilitarla.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la liquidación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-7">
        {/* Header */}
        <div className="border-b border-dashed border-zinc-800 pb-6">
          <Link href={`/clientes/${clientId}/periodos-fiscales`} className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:text-teal-300">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al libro mensual
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-400 text-[#09090b]">
              <ScanLine className="h-5 w-5 stroke-[2.5]" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-400">Liquidación de IVA</p>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {period ? `${MONTHS[period.month]} ${period.year}` : 'Período mensual'}
              </h1>
            </div>
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4 text-sm text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p>
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-5 py-4 text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p>
          </div>
        ) : null}

        {/* Paso 1 — Subir archivos */}
        <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
          <StepTitle n={1} icon={<UploadCloud className="h-4 w-4" />} title="Subir archivos de AFIP" subtitle="Compras y ventas exportados de Mis Comprobantes (.csv). El sistema detecta automáticamente cuál es cuál." />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" multiple onChange={e => void uploadFiles(e.target.files)} className="hidden" id="afip-files" />
            <label htmlFor="afip-files" className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 ${uploading ? 'cursor-wait opacity-60' : ''}`}>
              <UploadCloud className="h-4 w-4" /> {uploading ? 'Importando…' : 'Seleccionar CSV (compras y ventas)'}
            </label>
            <button type="button" onClick={() => void loadDocuments()} disabled={isLoading} className="inline-flex h-10 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>
        </section>

        {/* Paso 2 — Revisar comprobantes */}
        <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
          <StepTitle n={2} icon={<FileSpreadsheet className="h-4 w-4" />} title="Revisar y seleccionar" subtitle="Destildá las filas que no quieras incluir. Solo los comprobantes tildados entran en la liquidación." />
          {documents.length === 0 ? (
            <p className="mt-4 rounded border border-dashed border-zinc-700 px-4 py-6 text-center text-xs text-zinc-500">
              {isLoading ? 'Cargando comprobantes…' : 'Todavía no hay comprobantes. Subí los CSV de AFIP arriba.'}
            </p>
          ) : (
            <div className="mt-4 space-y-6">
              <DocTable title="Ventas (débito fiscal)" rows={sales} onToggle={toggleRow} onToggleAll={inc => toggleAll('SALE', inc)} vatTotal={includedSalesVat} />
              <DocTable title="Compras (crédito fiscal)" rows={purchases} onToggle={toggleRow} onToggleAll={inc => toggleAll('PURCHASE', inc)} vatTotal={includedPurchasesVat} />
            </div>
          )}
          <div className="mt-5">
            <button type="button" onClick={() => void calculate()} disabled={calculating || documents.length === 0} className="inline-flex h-10 items-center gap-2 rounded bg-zinc-100 px-4 text-xs font-extrabold text-zinc-900 transition-colors hover:bg-white disabled:opacity-40">
              <Calculator className="h-4 w-4" /> {calculating ? 'Calculando…' : 'Calcular liquidación'}
            </button>
          </div>
        </section>

        {/* Paso 3 — Totales + cotejo + guardar */}
        {settlement ? (
          <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
            <StepTitle n={3} icon={<Calculator className="h-4 w-4" />} title="Cotejar con AFIP y guardar" subtitle="Compará estos totales con el F2002 de AFIP. Si coinciden, guardá: quedarán fijados para la liquidación anual." />

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* Totales calculados (estilo F2002) */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-400">Calculado por la app</p>
                <Row label="Débito fiscal" value={settlement.debitFiscal} strong />
                <Row label="Crédito fiscal" value={settlement.creditFiscal} strong />
                <Row label="Saldo técnico del período" value={settlement.technicalDue} />
                {Number(settlement.technicalCarryForward) > 0 ? <Row label="Saldo técnico a favor (arrastra)" value={settlement.technicalCarryForward} muted /> : null}
                {Number(settlement.creditsApplied) > 0 ? <Row label="Percep./retenc. aplicadas" value={settlement.creditsApplied} muted /> : null}
                <div className="my-2 border-t border-zinc-800" />
                <Row label="Saldo a pagar" value={settlement.amountDue} highlight />
                {Number(settlement.freeAvailabilityBalance) > 0 ? <Row label="Libre disponibilidad (arrastra)" value={settlement.freeAvailabilityBalance} muted /> : null}

                <p className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Desglose por alícuota</p>
                <div className="space-y-1">
                  {settlement.debitByRate.map(r => <MiniRow key={`d-${r.rate}`} label={`Débito ${ratePct(r.rate)}`} base={r.taxableBase} vat={r.vatAmount} />)}
                  {settlement.creditByRate.map((r, i) => <MiniRow key={`c-${r.rate}-${i}`} label={`Crédito ${ratePct(r.rate)}${r.computable ? '' : ' (no comp.)'}`} base={r.taxableBase} vat={r.vatAmount} />)}
                </div>
              </div>

              {/* Cotejo */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">Valores de AFIP (cotejo)</p>
                <CotejoInput label="Débito fiscal AFIP" value={offDebit} onChange={setOffDebit} />
                <CotejoInput label="Crédito fiscal AFIP" value={offCredit} onChange={setOffCredit} />
                <CotejoInput label="Saldo a pagar AFIP" value={offDue} onChange={setOffDue} />
                <div className="mt-3">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Referencia (opcional)</label>
                  <input value={offRef} onChange={e => setOffRef(e.target.value)} placeholder="N° de presentación, fecha…" className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-teal-400" />
                </div>

                {liveCotejo ? (
                  <div className={`mt-4 rounded-lg border p-3 text-xs ${liveCotejo.allOk ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-amber-500/30 bg-amber-950/20'}`}>
                    <p className={`mb-2 flex items-center gap-2 font-bold ${liveCotejo.allOk ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {liveCotejo.allOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {liveCotejo.allOk ? 'Coincide con AFIP — listo para cerrar' : !liveCotejo.complete ? 'Cargá los tres importes para poder cerrar' : 'Hay diferencias con AFIP'}
                    </p>
                    {liveCotejo.checks.map(c => (
                      <p key={c.concept} className="flex justify-between gap-3 text-zinc-400">
                        <span>{c.concept}</span>
                        <span className={c.ok ? 'text-emerald-300' : 'text-amber-300'}>{c.ok ? '✓' : `app ${fmt(c.app)} ≠ ${fmt(c.official)}`}</span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {cotejoDiffs && cotejoDiffs.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {cotejoDiffs.map(d => <p key={d.concept}>{d.concept}: app {fmt(d.app)} vs AFIP {fmt(d.official)} (dif {fmt(d.diff)})</p>)}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void save(false)} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:opacity-50">
                    <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar liquidación'}
                  </button>
                  {canForceSave ? (
                    <button type="button" onClick={() => void save(true)} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-4 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50">
                      Guardar igual (con observación)
                    </button>
                  ) : null}
                </div>
                {saveResult ? (
                  <p className="mt-3 text-xs text-emerald-300">Guardado: {humanStatus(saveResult.status)} · versión {saveResult.version}</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StepTitle({ n, icon, title, subtitle }: { n: number; icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-500/30 bg-teal-500/10 text-xs font-extrabold text-teal-300">{n}</span>
      <div>
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-white">{icon}{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{subtitle}</p>
      </div>
    </div>
  );
}

function DocTable({ title, rows, onToggle, onToggleAll, vatTotal }: {
  title: string;
  rows: DocumentRow[];
  onToggle: (id: string, included: boolean) => void;
  onToggleAll: (included: boolean) => void;
  vatTotal: number;
}) {
  const allOn = rows.length > 0 && rows.every(r => r.includedInSettlement);
  const includedCount = rows.filter(r => r.includedInSettlement).length;
  if (rows.length === 0) {
    return <div className="rounded border border-dashed border-zinc-800 px-3 py-3 text-[11px] text-zinc-600">{title}: sin comprobantes.</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex items-center justify-between gap-3 bg-zinc-900/60 px-3 py-2">
        <p className="text-xs font-bold text-zinc-200">{title} <span className="font-mono text-zinc-500">· {includedCount}/{rows.length}</span></p>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-400">IVA incluido: <strong className="font-mono text-teal-300">{fmt(vatTotal)}</strong></span>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            <input type="checkbox" checked={allOn} onChange={e => onToggleAll(e.target.checked)} className="h-3.5 w-3.5 accent-teal-400" /> Todos
          </label>
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-zinc-950/90 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-1.5 w-8"></th>
              <th className="px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5">Tipo</th>
              <th className="px-2 py-1.5">Número</th>
              <th className="px-2 py-1.5">Contraparte</th>
              <th className="px-2 py-1.5 text-right">Neto</th>
              <th className="px-2 py-1.5 text-right">IVA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-t border-zinc-900 ${r.includedInSettlement ? '' : 'opacity-40'}`}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={r.includedInSettlement} onChange={e => onToggle(r.id, e.target.checked)} className="h-3.5 w-3.5 accent-teal-400" /></td>
                <td className="px-2 py-1.5 font-mono text-zinc-400">{r.issueDate}</td>
                <td className="px-2 py-1.5 text-zinc-500">{r.voucherType}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-400">{r.voucherNumber}</td>
                <td className="px-2 py-1.5 text-zinc-300">{r.counterpartyName || r.counterpartyCuit || '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{fmt(r.netAmount)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-zinc-200">{fmt(r.vatAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, strong, highlight, muted }: { label: string; value: string; strong?: boolean; highlight?: boolean; muted?: boolean }) {
  return (
    <p className={`flex justify-between gap-4 py-1 text-sm ${muted ? 'text-zinc-500' : 'text-zinc-300'}`}>
      <span>{label}</span>
      <strong className={`font-mono ${highlight ? 'text-lg text-teal-300' : strong ? 'text-zinc-100' : 'text-zinc-300'}`}>{fmt(value)}</strong>
    </p>
  );
}

function MiniRow({ label, base, vat }: { label: string; base: string; vat: string }) {
  return (
    <p className="flex justify-between gap-3 text-[11px] text-zinc-500">
      <span>{label}</span>
      <span className="font-mono">base {fmt(base)} · IVA <span className="text-zinc-300">{fmt(vat)}</span></span>
    </p>
  );
}

function CotejoInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-2">
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</label>
      <input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="0,00" className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-amber-400" />
    </div>
  );
}

function humanStatus(status: string): string {
  return ({ DRAFT: 'Borrador', IN_REVIEW: 'En revisión', READY_TO_FILE: 'Lista para presentar', FILED_EXTERNALLY: 'Presentada', CLOSED: 'Cerrada / cotejada', ANNULLED: 'Anulada' } as Record<string, string>)[status] ?? status;
}
