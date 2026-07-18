import { PackagePlus, Undo2, XCircle } from 'lucide-react';

export type FixedAssetCandidateView = {
  id: string;
  sourceMonth: number;
  description: string;
  counterpartyName: string | null;
  purchaseDate: string;
  originalCost: string;
  status: string;
};

type FixedAssetCandidatesPanelProps = {
  candidates: FixedAssetCandidateView[];
  onConfirm: (candidate: FixedAssetCandidateView) => void;
  onDismiss: (candidate: FixedAssetCandidateView) => void;
  onReopen: (candidate: FixedAssetCandidateView) => void;
};

function formatCandidateAmount(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return '$' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Circuito de candidatos a bienes de uso detectados por la importación del libro mensual:
 * cada candidato PENDING puede convertirse en una fila de la tabla de bienes de uso
 * (queda CONFIRMED) o descartarse (DISMISSED); ambos se pueden deshacer.
 */
export function FixedAssetCandidatesPanel({
  candidates,
  onConfirm,
  onDismiss,
  onReopen,
}: FixedAssetCandidatesPanelProps) {
  if (candidates.length === 0) return null;

  const pending = candidates.filter(candidate => candidate.status === 'PENDING');
  const processed = candidates.filter(candidate => candidate.status !== 'PENDING');

  return (
    <section
      aria-label="Candidatos a bienes de uso importados del libro mensual"
      className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3"
    >
      <div>
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
          Candidatos a bienes de uso (importados del libro mensual)
        </h4>
        <p className="mt-1 text-[10px] text-zinc-400">
          Compras que parecen bienes de uso y no entraron como gasto. Agregalas como bien
          (completando tipo y vida útil en la tabla) o descartalas si no corresponden.
        </p>
      </div>

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map(candidate => (
            <li
              key={candidate.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-zinc-800 bg-[#111115] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold text-zinc-200">
                  {candidate.counterpartyName || 'Proveedor sin identificar'}
                </span>
                <span className="block text-[10px] text-zinc-500">
                  {candidate.description} · {candidate.purchaseDate} · mes {String(candidate.sourceMonth).padStart(2, '0')}
                </span>
              </div>
              <span className="shrink-0 font-mono text-xs font-bold text-white">
                {formatCandidateAmount(candidate.originalCost)}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onConfirm(candidate)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#09090b] transition-colors hover:bg-teal-400 cursor-pointer"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  Agregar como bien
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(candidate)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:bg-zinc-700 cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length === 0 && (
        <p className="text-[10px] font-semibold text-emerald-300">
          Todos los candidatos fueron procesados.
        </p>
      )}

      {processed.length > 0 && (
        <ul className="space-y-1 border-t border-zinc-800/60 pt-2">
          {processed.map(candidate => (
            <li key={candidate.id} className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span className={candidate.status === 'CONFIRMED' ? 'text-teal-400/80' : 'text-zinc-500'}>
                {candidate.status === 'CONFIRMED' ? 'Agregado' : 'Descartado'}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {candidate.counterpartyName || candidate.description} · {formatCandidateAmount(candidate.originalCost)}
              </span>
              <button
                type="button"
                onClick={() => onReopen(candidate)}
                title="Volver a dejar el candidato pendiente (si lo habías agregado, eliminá también la fila de la tabla)"
                className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200 cursor-pointer"
              >
                <Undo2 className="h-3 w-3" />
                Deshacer
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
