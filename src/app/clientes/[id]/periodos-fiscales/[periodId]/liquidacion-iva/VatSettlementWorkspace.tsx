'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, UploadCloud, RefreshCw, ShieldAlert, CheckCircle2, AlertTriangle,
  Calculator, Save, FileSpreadsheet, ScanLine, MapPin, Trash2,
} from 'lucide-react';
import { calculateGrossIncomeLivePreview } from '@/domain/ganancias/presentation/grossIncomeLivePreview';
import { parseMoneyToPlain } from '@/domain/ganancias/presentation/parseMoney';

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
  technicalDueBeforeBenefit: string;
  smallTaxpayerBenefitRate: string;
  smallTaxpayerBenefitReduction: string;
  technicalDue: string;
  technicalCarryForward: string;
  creditsApplied: string;
  amountDue: string;
  freeAvailabilityBalance: string;
  debitByRate: Array<{ rate: string; taxableBase: string; vatAmount: string }>;
  creditByRate: Array<{ rate: string; taxableBase: string; vatAmount: string; computable: boolean }>;
};

type TaxCreditRow = {
  id: string;
  kind: 'WITHHOLDING' | 'PERCEPTION' | string;
  agentCuit: string | null;
  certificateNumber: string | null;
  issueDate: string;
  amount: string;
  includedInSettlement: boolean;
};

type GrossIncomeView = {
  regime: string;
  taxableBase: string;
  totalDeterminedTax: string;
  totalCreditsApplied: string;
  totalBalanceDue: string;
  totalFavorCarryForward: string;
  jurisdictionLines: Array<{ jurisdictionCode: string; activityCode: string; assignedBase: string; taxRate: string; determinedTax: string; previousFavorBalance: string; creditsApplied: string; balanceDue: string; favorCarryForward: string }>;
  warnings: string[];
};

type SavedSettlement = {
  id: string;
  version: number;
  status: string;
  debitFiscal: string;
  creditFiscal: string;
  previousTechnicalBalance: string;
  previousFreeAvailabilityBalance: string;
  technicalDueBeforeBenefit: string;
  smallTaxpayerBenefitRate: string;
  smallTaxpayerBenefitReduction: string;
  technicalCarryForward: string;
  freeAvailabilityBalance: string;
  amountDue: string;
  creditsApplied: string;
  officialAmount: string | null;
  officialReference: string | null;
  updatedAt: string;
};

type OpeningBalancesView = {
  vat: {
    previousTechnical: string;
    automaticPreviousTechnical: string;
    previousTechnicalSource: 'AUTO' | 'MANUAL';
    previousFree: string;
    automaticPreviousFree: string;
    previousFreeSource: 'AUTO' | 'MANUAL';
  };
  grossIncome: Record<string, { value: string; automaticValue: string; source: 'AUTO' | 'MANUAL' }>;
};

type BenefitInfo = { enabled: boolean; startYear: number | null; rate: string };

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
  const [deletingDocuments, setDeletingDocuments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Retenciones y percepciones (créditos de IVA)
  const [taxCredits, setTaxCredits] = useState<TaxCreditRow[]>([]);
  const [uploadingCredits, setUploadingCredits] = useState(false);
  const creditsFileInputRef = useRef<HTMLInputElement>(null);

  const [settlement, setSettlement] = useState<VatView | null>(null);
  const [calculating, setCalculating] = useState(false);
  // Vacío = arrastre automático del último mes cerrado. "0" permite reemplazarlo explícitamente.
  const [previousTechnical, setPreviousTechnical] = useState('');
  const [previousFree, setPreviousFree] = useState('');
  const [openingBalances, setOpeningBalances] = useState<OpeningBalancesView | null>(null);
  const [benefitInfo, setBenefitInfo] = useState<BenefitInfo | null>(null);

  // IIBB calculado del período + cotejo/guardado
  const [grossIncome, setGrossIncome] = useState<GrossIncomeView | null>(null);
  const [grossIncomeNotice, setGrossIncomeNotice] = useState<string | null>(null);
  const [iibbOfficial, setIibbOfficial] = useState('');
  const [iibbRef, setIibbRef] = useState('');
  const [savingIibb, setSavingIibb] = useState(false);
  const [savedIibbStatus, setSavedIibbStatus] = useState<{ status: string; version: number } | null>(null);
  // Reparto por monto: base editable de cada actividad (key = "jurisdiccion|actividad").
  const [activityBases, setActivityBases] = useState<Record<string, string>>({});
  const [iibbPreviousBalances, setIibbPreviousBalances] = useState<Record<string, string>>({});
  const [iibbBalancesDirty, setIibbBalancesDirty] = useState(false);

  // Liquidación ya guardada (al volver a un mes cerrado) + modo "reliquidar".
  const [savedSettlement, setSavedSettlement] = useState<SavedSettlement | null>(null);
  const [reliquidating, setReliquidating] = useState(false);

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

  const loadTaxCredits = useCallback(async () => {
    try {
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/tax-credits`, { cache: 'no-store' });
      const payload = await res.json();
      if (res.ok && payload.success) setTaxCredits(payload.data.credits);
    } catch {
      // si falla la carga de ret/perc no bloquea la pantalla de comprobantes
    }
  }, [clientId, periodId]);

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/settlement/saved`, { cache: 'no-store' });
      const payload = await res.json();
      if (res.ok && payload.success) setSavedSettlement(payload.data.saved);
    } catch {
      // si falla, la pantalla funciona en modo cálculo normal
    }
  }, [clientId, periodId]);

  const loadSavedIibb = useCallback(async () => {
    try {
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/settlement/iibb/saved`, { cache: 'no-store' });
      const payload = await res.json();
      if (res.ok && payload.success && payload.data.saved) {
        setSavedIibbStatus({ status: payload.data.saved.status, version: payload.data.saved.version });
        if (payload.data.saved.officialAmount) setIibbOfficial(payload.data.saved.officialAmount);
      }
    } catch {
      // opcional
    }
  }, [clientId, periodId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDocuments();
      void loadTaxCredits();
      void loadSaved();
      void loadSavedIibb();
    });
  }, [loadDocuments, loadTaxCredits, loadSaved, loadSavedIibb]);

  const saveIibb = async (force: boolean) => {
    if (iibbBalancesDirty) {
      setError('Recalculá IIBB después de modificar los saldos anteriores antes de guardar.');
      return;
    }
    setSavingIibb(true);
    setError(null);
    try {
      const official = (iibbOfficial || iibbRef) ? { amount: iibbOfficial || null, reference: iibbRef || null } : null;
      const bases = Object.entries(activityBases).map(([key, base]) => {
        const [jurisdictionCode, activityCode] = key.split('|');
        return { jurisdictionCode, activityCode, base };
      });
      const previousFavorBalances = Object.entries(iibbPreviousBalances)
        .filter(([, amount]) => amount.trim() !== '')
        .map(([jurisdictionCode, amount]) => ({ jurisdictionCode, amount }));
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/settlement/iibb/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          official,
          forceSave: force,
          activityBases: bases.length > 0 ? bases : undefined,
          previousFavorBalances: previousFavorBalances.length > 0 ? previousFavorBalances : undefined,
        }),
      });
      const payload = await res.json();
      if (res.status === 409) { setError(payload.error || 'El saldo de IIBB no coincide con el oficial.'); return; }
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo guardar IIBB.');
      setSavedIibbStatus({ status: payload.data.status, version: payload.data.version });
      setNotice(payload.data.status === 'CLOSED'
        ? `IIBB cotejado y cerrado (versión ${payload.data.version}). Disponible como gasto deducible en Ganancias.`
        : `IIBB guardado como ${humanStatus(payload.data.status)} (versión ${payload.data.version}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar IIBB.');
    } finally {
      setSavingIibb(false);
    }
  };

  const includedWithholding = useMemo(
    () => taxCredits.filter(c => c.includedInSettlement && c.kind === 'WITHHOLDING').reduce((s, c) => s + Number(c.amount), 0),
    [taxCredits],
  );
  const includedPerception = useMemo(
    () => taxCredits.filter(c => c.includedInSettlement && c.kind === 'PERCEPTION').reduce((s, c) => s + Number(c.amount), 0),
    [taxCredits],
  );

  const uploadCreditsFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingCredits(true);
    setError(null);
    setNotice(null);
    setSettlement(null);
    try {
      const form = new FormData();
      Array.from(files).forEach(f => form.append('files', f));
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/tax-credits`, { method: 'POST', body: form });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo importar el archivo de retenciones/percepciones.');
      const d = payload.data;
      let msg = `Importadas ${d.inserted} ret./perc. (${d.duplicates} duplicadas).`;
      if (d.outOfPeriod?.length) msg += ` ${d.outOfPeriod.length} quedaron fuera del mes y no se cargaron.`;
      if (d.ignoredOtherTax) msg += ` ${d.ignoredOtherTax} de otros impuestos ignoradas.`;
      setNotice(msg);
      await loadTaxCredits();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el archivo de retenciones/percepciones.');
    } finally {
      setUploadingCredits(false);
      if (creditsFileInputRef.current) creditsFileInputRef.current.value = '';
    }
  };

  const persistCreditSelection = useCallback(async (changes: Array<{ creditId: string; included: boolean }>) => {
    try {
      await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/tax-credits/selection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
    } catch {
      void loadTaxCredits();
    }
  }, [clientId, periodId, loadTaxCredits]);

  const toggleCreditRow = (id: string, included: boolean) => {
    setTaxCredits(prev => prev.map(c => (c.id === id ? { ...c, includedInSettlement: included } : c)));
    setSettlement(null);
    void persistCreditSelection([{ creditId: id, included }]);
  };

  const toggleAllCredits = (included: boolean) => {
    setTaxCredits(prev => prev.map(c => ({ ...c, includedInSettlement: included })));
    setSettlement(null);
    void persistCreditSelection(taxCredits.map(c => ({ creditId: c.id, included })));
  };

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
      setNotice(`Importados ${payload.data.inserted} comprobantes nuevos, ${payload.data.updated} actualizados y ${payload.data.duplicates} sin cambios.`);
      await loadDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron importar los archivos.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteLoadedDocuments = async () => {
    if (documents.length === 0 || deletingDocuments) return;
    const periodLabel = period ? `${MONTHS[period.month]} ${period.year}` : 'este período';
    const confirmed = window.confirm(
      `Se eliminarán los ${documents.length} comprobantes cargados en ${periodLabel}.\n\n`
      + 'Las retenciones y percepciones no se eliminarán. Esta acción no se puede deshacer. ¿Desea continuar?',
    );
    if (!confirmed) return;

    setDeletingDocuments(true);
    setError(null);
    setNotice(null);
    setSettlement(null);
    setGrossIncome(null);
    setActivityBases({});
    try {
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/documents`, {
        method: 'DELETE',
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudieron eliminar los comprobantes.');
      }
      setDocuments([]);
      setNotice(`Se eliminaron ${payload.data.deleted} comprobantes de ${periodLabel}. Ya podés cargar los archivos en el mes correcto.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron eliminar los comprobantes.');
      await loadDocuments();
    } finally {
      setDeletingDocuments(false);
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
      const params = new URLSearchParams();
      if (previousTechnical.trim() !== '') params.set('previousTechnical', previousTechnical);
      if (previousFree.trim() !== '') params.set('previousFree', previousFree);
      const manualIibb = Object.fromEntries(
        Object.entries(iibbPreviousBalances).filter(([, amount]) => amount.trim() !== ''),
      );
      if (Object.keys(manualIibb).length > 0) params.set('iibbPrevious', JSON.stringify(manualIibb));
      const query = params.size > 0 ? `?${params.toString()}` : '';
      const res = await fetch(`/api/clientes/${clientId}/fiscal-periods/${periodId}/settlement${query}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || 'No se pudo calcular la liquidación.');
      setSettlement(payload.data.vat);
      const gi: GrossIncomeView | null = payload.data.grossIncome ?? null;
      setGrossIncome(gi);
      setGrossIncomeNotice(payload.data.grossIncomeNotice ?? null);
      setOpeningBalances(payload.data.openingBalances ?? null);
      setBenefitInfo(payload.data.smallTaxpayerBenefit ?? null);
      setIibbBalancesDirty(false);
      // Precarga las bases editables por actividad con lo que sugiere el servidor (reparto equitativo).
      if (gi) {
        const perJur = new Map<string, number>();
        for (const l of gi.jurisdictionLines) perJur.set(l.jurisdictionCode, (perJur.get(l.jurisdictionCode) ?? 0) + 1);
        const hasMulti = [...perJur.values()].some(n => n > 1);
        if (hasMulti) {
          const initial: Record<string, string> = {};
          for (const l of gi.jurisdictionLines) initial[`${l.jurisdictionCode}|${l.activityCode}`] = l.assignedBase;
          setActivityBases(initial);
        } else {
          setActivityBases({});
        }
      }
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
      const offNum = Number(parseMoneyToPlain(off) ?? NaN);
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
        body: JSON.stringify({
          official,
          forceSave: force,
          openingBalances: {
            previousTechnical: previousTechnical.trim() === '' ? undefined : previousTechnical,
            previousFree: previousFree.trim() === '' ? undefined : previousFree,
          },
        }),
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
      // Refresca el panel de "liquidación guardada" y vuelve al modo lectura.
      setReliquidating(false);
      setSettlement(null);
      await loadSaved();
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

        {/* Liquidación ya guardada (al volver a un mes cerrado) */}
        {savedSettlement && !reliquidating ? (
          <SavedSettlementPanel
            saved={savedSettlement}
            onReliquidar={() => {
              setReliquidating(true);
              setSettlement(null);
              if (savedSettlement.officialAmount) setOffDue(savedSettlement.officialAmount);
            }}
          />
        ) : null}

        {(!savedSettlement || reliquidating) ? (
        <>
        {/* Paso 1 — Subir archivos */}
        <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
          <StepTitle n={1} icon={<UploadCloud className="h-4 w-4" />} title="Subir archivos de AFIP" subtitle="Compras y ventas exportados de Mis Comprobantes (.csv). El sistema detecta automáticamente cuál es cuál." />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" multiple disabled={uploading || deletingDocuments} onChange={e => void uploadFiles(e.target.files)} className="hidden" id="afip-files" />
            <label htmlFor="afip-files" className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 ${(uploading || deletingDocuments) ? 'pointer-events-none cursor-wait opacity-60' : ''}`}>
              <UploadCloud className="h-4 w-4" /> {uploading ? 'Importando…' : 'Seleccionar CSV (compras y ventas)'}
            </label>
            <button type="button" onClick={() => void loadDocuments()} disabled={isLoading || deletingDocuments} className="inline-flex h-10 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-teal-500/50 hover:text-teal-300 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
            <button
              type="button"
              onClick={() => void deleteLoadedDocuments()}
              disabled={documents.length === 0 || deletingDocuments || uploading}
              className="inline-flex h-10 items-center gap-2 rounded border border-red-500/35 bg-red-950/20 px-3 text-xs font-bold text-red-300 transition-colors hover:border-red-400 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> {deletingDocuments ? 'Eliminando…' : 'Eliminar comprobantes cargados'}
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
        </section>

        {/* Paso 2b — Retenciones y percepciones */}
        <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
          <StepTitle n="2b" icon={<ScanLine className="h-4 w-4" />} title="Retenciones y percepciones (IVA)" subtitle="Subí el archivo de 'Mis Retenciones' de ARCA. Se aplican contra el saldo a pagar; el excedente queda como saldo de libre disponibilidad." />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input ref={creditsFileInputRef} type="file" accept=".csv,text/csv" multiple onChange={e => void uploadCreditsFiles(e.target.files)} className="hidden" id="retperc-files" />
            <label htmlFor="retperc-files" className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 ${uploadingCredits ? 'cursor-wait opacity-60' : ''}`}>
              <UploadCloud className="h-4 w-4" /> {uploadingCredits ? 'Importando…' : 'Subir archivo de ret./perc.'}
            </label>
            <span className="text-[11px] text-zinc-400">
              Retenciones: <strong className="font-mono text-teal-300">{fmt(includedWithholding)}</strong> · Percepciones: <strong className="font-mono text-teal-300">{fmt(includedPerception)}</strong>
            </span>
          </div>
          {taxCredits.length > 0 ? (
            <div className="mt-4">
              <CreditTable rows={taxCredits} onToggle={toggleCreditRow} onToggleAll={toggleAllCredits} />
            </div>
          ) : (
            <p className="mt-4 rounded border border-dashed border-zinc-700 px-4 py-4 text-center text-[11px] text-zinc-500">Sin retenciones/percepciones cargadas (opcional).</p>
          )}

          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs font-extrabold text-zinc-200">Saldos de IVA del período anterior</p>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">Dejá el campo vacío para usar el arrastre automático del último mes cerrado. Podés ingresar 0 o un importe para reemplazarlo en esta liquidación.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <OpeningBalanceInput
                label="Saldo técnico a favor anterior"
                value={previousTechnical}
                automaticValue={openingBalances?.vat.automaticPreviousTechnical}
                onChange={value => {
                  setPreviousTechnical(value);
                  setSettlement(null);
                  setGrossIncome(null);
                }}
              />
              <OpeningBalanceInput
                label="Saldo de libre disponibilidad anterior"
                value={previousFree}
                automaticValue={openingBalances?.vat.automaticPreviousFree}
                onChange={value => {
                  setPreviousFree(value);
                  setSettlement(null);
                  setGrossIncome(null);
                }}
              />
            </div>
          </div>

          <div className="mt-5">
            <button type="button" onClick={() => void calculate()} disabled={calculating || documents.length === 0} className="inline-flex h-10 items-center gap-2 rounded bg-zinc-100 px-4 text-xs font-extrabold text-zinc-900 transition-colors hover:bg-white disabled:opacity-40">
              <Calculator className="h-4 w-4" /> {calculating ? 'Calculando…' : 'Calcular liquidación'}
            </button>
          </div>
        </section>
        </>
        ) : null}

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
                {Number(openingBalances?.vat.previousTechnical ?? 0) > 0 ? <Row label="Saldo técnico a favor anterior aplicado" value={openingBalances?.vat.previousTechnical ?? '0'} muted /> : null}
                {Number(settlement.smallTaxpayerBenefitReduction) > 0 ? (
                  <>
                    <Row label="Saldo técnico antes del beneficio" value={settlement.technicalDueBeforeBenefit} />
                    <Row label={`Reducción pequeños contribuyentes (${(Number(settlement.smallTaxpayerBenefitRate) * 100).toFixed(0)}%)`} value={settlement.smallTaxpayerBenefitReduction} muted />
                    <Row label="Saldo técnico luego del beneficio" value={settlement.technicalDue} />
                  </>
                ) : <Row label="Saldo técnico del período" value={settlement.technicalDue} />}
                {Number(settlement.technicalCarryForward) > 0 ? <Row label="Saldo técnico a favor (arrastra)" value={settlement.technicalCarryForward} muted /> : null}
                {Number(openingBalances?.vat.previousFree ?? 0) > 0 ? <Row label="Libre disponibilidad anterior aplicada" value={openingBalances?.vat.previousFree ?? '0'} muted /> : null}
                {Number(settlement.creditsApplied) > 0 ? <Row label="Percep./retenc. aplicadas" value={settlement.creditsApplied} muted /> : null}
                <div className="my-2 border-t border-zinc-800" />
                <Row label="Saldo a pagar" value={settlement.amountDue} highlight />
                {Number(settlement.freeAvailabilityBalance) > 0 ? <Row label="Libre disponibilidad (arrastra)" value={settlement.freeAvailabilityBalance} muted /> : null}
                {benefitInfo?.enabled && Number(benefitInfo.rate) === 0 ? (
                  <p className="mt-3 rounded border border-zinc-800 px-3 py-2 text-[10px] leading-4 text-zinc-500">El beneficio está configurado desde {benefitInfo.startYear}, pero este período queda fuera de sus tres años de reducción.</p>
                ) : null}

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

        {/* IIBB — Ingresos Brutos */}
        {settlement && (grossIncome || grossIncomeNotice) ? (
          <IibbSection
            view={grossIncome}
            notice={grossIncomeNotice}
            official={iibbOfficial}
            onOfficial={setIibbOfficial}
            reference={iibbRef}
            onReference={setIibbRef}
            saving={savingIibb}
            savedStatus={savedIibbStatus}
            onSave={saveIibb}
            activityBases={activityBases}
            onActivityBase={(key, v) => setActivityBases(prev => ({ ...prev, [key]: v }))}
            automaticPreviousBalances={openingBalances?.grossIncome ?? {}}
            previousBalances={iibbPreviousBalances}
            balancesDirty={iibbBalancesDirty}
            onPreviousBalance={(jurisdictionCode, value) => {
              setIibbPreviousBalances(prev => ({ ...prev, [jurisdictionCode]: value }));
              setIibbBalancesDirty(true);
            }}
            onRecalculate={() => void calculate()}
          />
        ) : null}
      </div>
    </main>
  );
}

function IibbSection({ view, notice, official, onOfficial, reference, onReference, saving, savedStatus, onSave, activityBases, onActivityBase, automaticPreviousBalances, previousBalances, balancesDirty, onPreviousBalance, onRecalculate }: {
  view: GrossIncomeView | null;
  notice: string | null;
  official: string;
  onOfficial: (v: string) => void;
  reference: string;
  onReference: (v: string) => void;
  saving: boolean;
  savedStatus: { status: string; version: number } | null;
  onSave: (force: boolean) => void;
  activityBases: Record<string, string>;
  onActivityBase: (key: string, v: string) => void;
  automaticPreviousBalances: OpeningBalancesView['grossIncome'];
  previousBalances: Record<string, string>;
  balancesDirty: boolean;
  onPreviousBalance: (jurisdictionCode: string, value: string) => void;
  onRecalculate: () => void;
}) {
  // Multi-actividad: alguna jurisdicción con más de una línea (dos actividades con distinta alícuota).
  const perJur = new Map<string, number>();
  for (const l of view?.jurisdictionLines ?? []) perJur.set(l.jurisdictionCode, (perJur.get(l.jurisdictionCode) ?? 0) + 1);
  const isMulti = [...perJur.values()].some(n => n > 1);

  // En modo multi se recalculan en vivo impuesto, créditos, saldo a pagar y saldo a favor.
  const live = calculateGrossIncomeLivePreview(view?.jurisdictionLines ?? [], activityBases, isMulti);
  const localDetermined = (l: { jurisdictionCode: string; activityCode: string }) =>
    live.determinedByLine[`${l.jurisdictionCode}|${l.activityCode}`] ?? 0;
  const grossBase = Number(view?.taxableBase ?? 0);
  const basesMatch = live.basesValid
    && live.basesNonNegative
    && Math.abs(live.totalAssignedBase - grossBase) <= 0.01;

  const liveTarget = isMulti ? live.totalBalanceDue : Number(view?.totalBalanceDue ?? NaN);
  const liveMatch = view
    && (!isMulti || basesMatch)
    && official.trim() !== ''
    && Math.abs(liveTarget - Number(parseMoneyToPlain(official) ?? NaN)) <= 0.01;

  return (
    <section className="rounded-xl border border-zinc-800 bg-[#121216] p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <StepTitle n="IIBB" icon={<MapPin className="h-4 w-4" />} title="Ingresos Brutos" subtitle="Base × coeficiente (Convenio) × alícuota por jurisdicción. Se cierra cotejando contra el organismo y alimenta Ganancias como gasto deducible." />
        {savedStatus ? <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${savedStatus.status === 'CLOSED' ? 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border border-amber-400/25 bg-amber-400/10 text-amber-200'}`}>{humanStatus(savedStatus.status)} v{savedStatus.version}</span> : null}
      </div>

      {notice ? <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">{notice}</p> : null}
      {view?.warnings.map(warning => (
        <p key={warning} className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">{warning}</p>
      ))}

      {view ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-zinc-200">Saldos a favor anteriores de IIBB</p>
                <p className="mt-1 text-[11px] text-zinc-500">Se cargan por jurisdicción. Vacío usa el arrastre automático del último mes cerrado; ingresá 0 para reemplazarlo.</p>
              </div>
              {balancesDirty ? (
                <button type="button" onClick={onRecalculate} className="inline-flex h-9 items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-200 hover:bg-amber-500/20">
                  <RefreshCw className="h-3.5 w-3.5" /> Recalcular saldos
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...perJur.keys()].map(jurisdictionCode => (
                <OpeningBalanceInput
                  key={jurisdictionCode}
                  label={`Jurisdicción ${jurisdictionCode}`}
                  value={previousBalances[jurisdictionCode] ?? ''}
                  automaticValue={automaticPreviousBalances[jurisdictionCode]?.automaticValue}
                  onChange={value => onPreviousBalance(jurisdictionCode, value)}
                />
              ))}
            </div>
            {balancesDirty ? <p className="mt-2 text-[10px] text-amber-300">Recalculá para aplicar los nuevos saldos antes de cotejar o guardar.</p> : null}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-400">Por jurisdicción{isMulti ? ' y actividad' : ''}</p>
            {isMulti ? (
              <p className="mb-2 text-[10px] text-zinc-500">Ingresá la base imponible de cada actividad. Deben sumar la base gravada del mes ({fmt(view.taxableBase)}).</p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-2 py-1">Juris.</th>
                    {isMulti ? <th className="px-2 py-1">Actividad</th> : null}
                    <th className="px-2 py-1 text-right">Base{isMulti ? ' (editar)' : ' asig.'}</th>
                    <th className="px-2 py-1 text-right">Alíc.</th>
                    <th className="px-2 py-1 text-right">Determinado</th>
                    {isMulti ? null : <th className="px-2 py-1 text-right">Saldo</th>}
                  </tr>
                </thead>
                <tbody>
                  {view.jurisdictionLines.map(l => {
                    const key = `${l.jurisdictionCode}|${l.activityCode}`;
                    return (
                      <tr key={key} className="border-t border-zinc-900">
                        <td className="px-2 py-1 font-mono text-zinc-300">{l.jurisdictionCode}</td>
                        {isMulti ? <td className="px-2 py-1 text-zinc-300">{l.activityCode || '—'}</td> : null}
                        <td className="px-2 py-1 text-right">
                          {isMulti ? (
                            <input inputMode="decimal" value={activityBases[key] ?? l.assignedBase} onChange={e => onActivityBase(key, e.target.value)} className="h-7 w-28 rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-zinc-200 outline-none focus:border-teal-400" />
                          ) : (
                            <span className="font-mono text-zinc-400">{fmt(l.assignedBase)}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-zinc-500">{(Number(l.taxRate) * 100).toFixed(2)}%</td>
                        <td className="px-2 py-1 text-right font-mono text-zinc-300">{isMulti ? fmt(localDetermined(l).toFixed(2)) : fmt(l.determinedTax)}</td>
                        {isMulti ? null : <td className="px-2 py-1 text-right font-mono text-zinc-200">{fmt(l.balanceDue)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isMulti ? (
              <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold ${basesMatch ? 'text-emerald-300' : 'text-amber-300'}`}>
                {basesMatch ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                Suma de bases: {fmt(live.totalAssignedBase.toFixed(2))} {basesMatch ? '— coincide con la base gravada' : `— debe ser ${fmt(view.taxableBase)}`}
              </p>
            ) : null}
            <div className="mt-3 border-t border-zinc-800 pt-2">
              <Row label="Impuesto determinado total" value={isMulti ? live.totalDeterminedTax.toFixed(2) : view.totalDeterminedTax} strong />
              {view.jurisdictionLines.reduce((sum, line) => sum + Number(line.previousFavorBalance), 0) > 0
                ? <Row label="Saldo a favor anterior aplicado" value={view.jurisdictionLines.reduce((sum, line) => sum + Number(line.previousFavorBalance), 0).toFixed(2)} muted />
                : null}
              {(isMulti ? live.totalCreditsApplied : Number(view.totalCreditsApplied)) > 0
                ? <Row label="Percep./retenc. IIBB aplicadas" value={isMulti ? live.totalCreditsApplied.toFixed(2) : view.totalCreditsApplied} muted />
                : null}
              <Row label="Saldo a pagar IIBB" value={isMulti ? live.totalBalanceDue.toFixed(2) : view.totalBalanceDue} highlight />
              {(isMulti ? live.totalFavorCarryForward : Number(view.totalFavorCarryForward)) > 0
                ? <Row label="Saldo a favor para el mes siguiente" value={isMulti ? live.totalFavorCarryForward.toFixed(2) : view.totalFavorCarryForward} muted />
                : null}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">Cotejo y guardado</p>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Saldo a pagar oficial (organismo)</label>
            <input inputMode="decimal" value={official} onChange={e => onOfficial(e.target.value)} placeholder="0,00" className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-amber-400" />
            <label className="mb-1 mt-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Referencia (opcional)</label>
            <input value={reference} onChange={e => onReference(e.target.value)} placeholder="N° presentación, jurisdicción…" className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-200 outline-none focus:border-teal-400" />
            {official.trim() !== '' ? (
              <p className={`mt-3 flex items-center gap-2 text-xs font-bold ${liveMatch ? 'text-emerald-300' : 'text-amber-300'}`}>{liveMatch ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{liveMatch ? 'Coincide — listo para cerrar' : 'No coincide con el cálculo'}</p>
            ) : null}
            <button type="button" onClick={() => onSave(false)} disabled={saving || balancesDirty || (isMulti && !basesMatch)} className="mt-4 inline-flex h-10 items-center gap-2 rounded bg-teal-400 px-4 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar IIBB'}</button>
            {isMulti && !basesMatch ? (
              <p className="mt-2 text-[10px] text-amber-300">
                {!live.basesValid
                  ? 'Ingresá importes válidos en todas las bases.'
                  : !live.basesNonNegative
                    ? 'Las bases por actividad no pueden ser negativas.'
                    : 'Ajustá las bases para que sumen la base gravada antes de guardar.'}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SavedSettlementPanel({ saved, onReliquidar }: { saved: SavedSettlement; onReliquidar: () => void }) {
  const closed = saved.status === 'CLOSED';
  const fecha = saved.updatedAt ? new Date(saved.updatedAt).toLocaleDateString('es-AR') : '';
  return (
    <section className={`rounded-xl border p-5 shadow-xl ${closed ? 'border-emerald-500/30 bg-emerald-950/[0.15]' : 'border-amber-500/30 bg-amber-950/[0.12]'}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`flex items-center gap-2 text-sm font-extrabold ${closed ? 'text-emerald-300' : 'text-amber-300'}`}>
            <CheckCircle2 className="h-4 w-4" />
            Liquidación guardada — {humanStatus(saved.status)} · versión {saved.version}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {closed
              ? 'Este mes ya está cotejado y cerrado. Alimenta la liquidación anual de Ganancias.'
              : 'Guardada pero todavía no cerrada. Reliquidá y cotejá los tres importes para cerrarla.'}
            {fecha ? ` · Última actualización: ${fecha}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onReliquidar}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-4 text-xs font-bold text-zinc-200 transition-colors hover:border-teal-500/50 hover:text-teal-300"
        >
          <RefreshCw className="h-4 w-4" /> Reliquidar / Modificar
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
          <Row label="Débito fiscal" value={saved.debitFiscal} strong />
          <Row label="Crédito fiscal" value={saved.creditFiscal} strong />
          {Number(saved.previousTechnicalBalance) > 0 ? <Row label="Saldo técnico anterior aplicado" value={saved.previousTechnicalBalance} muted /> : null}
          {Number(saved.smallTaxpayerBenefitReduction) > 0 ? (
            <>
              <Row label="Saldo técnico antes del beneficio" value={saved.technicalDueBeforeBenefit} />
              <Row label={`Reducción beneficio (${(Number(saved.smallTaxpayerBenefitRate) * 100).toFixed(0)}%)`} value={saved.smallTaxpayerBenefitReduction} muted />
            </>
          ) : null}
          {Number(saved.previousFreeAvailabilityBalance) > 0 ? <Row label="Libre disponibilidad anterior aplicada" value={saved.previousFreeAvailabilityBalance} muted /> : null}
          {Number(saved.creditsApplied) > 0 ? <Row label="Percep./retenc. aplicadas" value={saved.creditsApplied} muted /> : null}
          {Number(saved.technicalCarryForward) > 0 ? <Row label="Saldo técnico a favor (arrastra)" value={saved.technicalCarryForward} muted /> : null}
          <div className="my-2 border-t border-zinc-800" />
          <Row label="Saldo a pagar" value={saved.amountDue} highlight />
          {Number(saved.freeAvailabilityBalance) > 0 ? <Row label="Libre disponibilidad (arrastra)" value={saved.freeAvailabilityBalance} muted /> : null}
        </div>
        {saved.officialAmount != null ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">Cotejo con AFIP</p>
            <Row label="Saldo a pagar AFIP" value={saved.officialAmount} />
            {saved.officialReference ? <p className="mt-2 text-xs text-zinc-500">Ref.: {saved.officialReference}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StepTitle({ n, icon, title, subtitle }: { n: number | string; icon: ReactNode; title: string; subtitle: string }) {
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
    return <div className="rounded border border-dashed border-zinc-800 px-3 py-3 text-[11px] text-zinc-400">{title}: sin comprobantes.</div>;
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
      <div className="max-h-72 overflow-auto">
        <table className="min-w-[980px] w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-zinc-950/90 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-1.5 w-8"></th>
              <th className="px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5">Tipo</th>
              <th className="px-2 py-1.5">Número</th>
              <th className="px-2 py-1.5">Contraparte</th>
              <th className="px-2 py-1.5 text-right">Neto</th>
              <th className="px-2 py-1.5 text-right">IVA</th>
              <th className="px-2 py-1.5 text-right">Total</th>
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
                <td className="px-2 py-1.5 text-right font-mono font-semibold text-teal-200">{fmt(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditTable({ rows, onToggle, onToggleAll }: {
  rows: TaxCreditRow[];
  onToggle: (id: string, included: boolean) => void;
  onToggleAll: (included: boolean) => void;
}) {
  const allOn = rows.length > 0 && rows.every(r => r.includedInSettlement);
  const includedCount = rows.filter(r => r.includedInSettlement).length;
  const kindLabel = (k: string) => (k === 'WITHHOLDING' ? 'Retención' : k === 'PERCEPTION' ? 'Percepción' : k);
  const includedTotal = rows.filter(r => r.includedInSettlement).reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex items-center justify-between gap-3 bg-zinc-900/60 px-3 py-2">
        <p className="text-xs font-bold text-zinc-200">Retenciones y percepciones <span className="font-mono text-zinc-500">· {includedCount}/{rows.length}</span></p>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-400">Total a aplicar: <strong className="font-mono text-teal-300">{fmt(includedTotal)}</strong></span>
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
              <th className="px-2 py-1.5">Tipo</th>
              <th className="px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5">Agente (CUIT)</th>
              <th className="px-2 py-1.5">Certificado</th>
              <th className="px-2 py-1.5 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={`border-t border-zinc-900 ${r.includedInSettlement ? '' : 'opacity-40'}`}>
                <td className="px-3 py-1.5"><input type="checkbox" checked={r.includedInSettlement} onChange={e => onToggle(r.id, e.target.checked)} className="h-3.5 w-3.5 accent-teal-400" /></td>
                <td className={`px-2 py-1.5 font-semibold ${r.kind === 'WITHHOLDING' ? 'text-sky-300' : 'text-violet-300'}`}>{kindLabel(r.kind)}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-400">{r.issueDate}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-400">{r.agentCuit || '—'}</td>
                <td className="px-2 py-1.5 font-mono text-zinc-500">{r.certificateNumber || '—'}</td>
                <td className={`px-2 py-1.5 text-right font-mono ${Number(r.amount) < 0 ? 'text-amber-300' : 'text-zinc-200'}`}>{fmt(r.amount)}</td>
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

function OpeningBalanceInput({ label, value, automaticValue, onChange }: {
  label: string;
  value: string;
  automaticValue?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</label>
      <input
        inputMode="decimal"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={automaticValue == null ? 'Automático' : `Automático: ${fmt(automaticValue)}`}
        className="h-9 w-full rounded border border-zinc-700 bg-zinc-950 px-2 text-right font-mono text-sm text-zinc-200 outline-none focus:border-teal-400"
      />
    </div>
  );
}

function humanStatus(status: string): string {
  return ({ DRAFT: 'Borrador', IN_REVIEW: 'En revisión', READY_TO_FILE: 'Lista para presentar', FILED_EXTERNALLY: 'Presentada', CLOSED: 'Cerrada / cotejada', ANNULLED: 'Anulada' } as Record<string, string>)[status] ?? status;
}
