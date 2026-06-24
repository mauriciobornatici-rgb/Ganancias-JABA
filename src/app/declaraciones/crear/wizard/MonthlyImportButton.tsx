'use client';

import { useState } from 'react';
import { Download, AlertTriangle, CheckCircle2 } from 'lucide-react';

type ImportSummary = {
  summary: { salesCount: number; purchasesCount: number; fixedAssetCount: number; pendingReview: number };
  monthsUsed: number[];
  iibbTotal: string;
  notices: string[];
  fixedAssetCandidates: unknown[];
};

/**
 * Botón aislado para traer el libro fiscal mensual (módulo IVA) a la DDJJ anual.
 *
 * Llama al endpoint idempotente `POST /api/declaraciones/:id/importar-mensual` (solo meses con IVA
 * cotejado/CLOSED). Tras importar recarga la página para que el wizard repueble ventas/compras desde
 * la base: así no hay riesgo de que el autosave del wizard pise los registros recién importados.
 */
export default function MonthlyImportButton({ taxReturnId }: { taxReturnId: string | null | undefined }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!taxReturnId) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-500">
        Guardá la declaración (avanzá un paso) para poder importar el libro fiscal mensual.
      </p>
    );
  }

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/declaraciones/${taxReturnId}/importar-mensual`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo importar el libro mensual.');
      }
      setResult(payload.data);
      setConfirming(false);
      // Limpia el snapshot local del wizard para que al recargar lea los registros frescos de la base
      // (evita que un estado viejo en localStorage tape lo recién importado). Clave usada por el wizard:
      // `jaba_wizard_state_<id>`.
      try {
        localStorage.removeItem(`jaba_wizard_state_${taxReturnId}`);
      } catch {
        // si localStorage no está disponible, la recarga igual trae los datos del servidor
      }
      // Recarga para repoblar el wizard desde la base con los registros importados.
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar el libro mensual.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-teal-500/25 bg-teal-500/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-teal-200">
            <Download className="h-4 w-4" /> Importar del módulo mensual (IVA)
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Trae las ventas y compras de los meses ya cotejados con AFIP, comprobante por comprobante.
            Reemplaza solo lo importado antes; tus cargas manuales quedan intactas.
          </p>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="shrink-0 rounded-lg bg-teal-400 px-3 py-2 text-xs font-extrabold text-[#09090b] transition-colors hover:bg-teal-300 disabled:opacity-50"
          >
            Importar
          </button>
        ) : null}
      </div>

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-xs text-amber-200">Esto reemplaza los registros importados previamente. ¿Continuar?</span>
          <button type="button" onClick={runImport} disabled={busy} className="rounded bg-teal-400 px-2.5 py-1 text-xs font-bold text-[#09090b] hover:bg-teal-300 disabled:opacity-50">
            {busy ? 'Importando…' : 'Sí, importar'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
            Cancelar
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">{error}</p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
          <p className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4" /> Importado: {result.summary.salesCount} ventas, {result.summary.purchasesCount} compras (meses {result.monthsUsed.join(', ')}).
          </p>
          {result.notices.map((n, i) => <p key={i} className="mt-1 text-amber-200">• {n}</p>)}
          <p className="mt-1 text-emerald-300">Recargando para mostrar los registros…</p>
        </div>
      ) : null}
    </div>
  );
}
