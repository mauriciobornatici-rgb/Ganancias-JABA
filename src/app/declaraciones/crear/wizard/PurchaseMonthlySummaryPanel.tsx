import { formatCurrencyCents } from '@/domain/ganancias/presentation/moneyFormat';
import {
  listExpenseBreakdown,
  type PurchaseExpenseBreakdown,
  type PurchaseMonthFilter,
  type PurchaseMonthlySummary,
} from '@/domain/ganancias/presentation/purchaseMonthlySummary';

/** Renglones por tipo de gasto dentro de una tarjeta (solo categorías con movimiento). */
function ExpenseBreakdownLines({ byExpenseType }: { byExpenseType: PurchaseExpenseBreakdown }) {
  const lines = listExpenseBreakdown(byExpenseType);
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 border-t border-zinc-800/70 pt-1.5">
      {lines.map(line => (
        <li key={line.key} className="flex items-baseline justify-between gap-2" title={`${line.label}: ${formatCurrencyCents(line.amount)}`}>
          <span className="truncate text-[10px] text-zinc-500">{line.shortLabel}</span>
          <span className="shrink-0 font-mono text-[10px] text-zinc-300">{formatCurrencyCents(line.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

type PurchaseMonthlySummaryPanelProps = {
  summary: PurchaseMonthlySummary;
  activeFilter: PurchaseMonthFilter;
  activeFilterLabel: string;
  onFilterChange: (filter: PurchaseMonthFilter) => void;
};

export function PurchaseMonthlySummaryPanel({
  summary,
  activeFilter,
  activeFilterLabel,
  onFilterChange,
}: PurchaseMonthlySummaryPanelProps) {
  return (
    <section
      aria-label="Resumen y filtro mensual de comprobantes de compras"
      className="rounded-xl border border-zinc-800 bg-[#0b0b0e] p-4 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-zinc-200">Compras por mes</h3>
          <p className="mt-1 text-[10px] text-zinc-500">Importe neto deducible y cantidad de comprobantes (los no deducibles no suman). Seleccione un mes para analizar su detalle.</p>
        </div>
        <button
          type="button"
          onClick={() => onFilterChange('all')}
          aria-pressed={activeFilter === 'all'}
          className={`rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${activeFilter === 'all'
            ? 'border-teal-400/60 bg-teal-500/15'
            : 'border-zinc-800 bg-[#111115] hover:border-teal-500/35'}`}
        >
          <span className="block text-[10px] font-black uppercase tracking-wider text-teal-300">Ver todos los meses</span>
          <span className="mt-0.5 block text-[10px] font-mono text-zinc-300">
            {formatCurrencyCents(summary.totalNetAmount)} · {summary.totalCount} comprobante{summary.totalCount === 1 ? '' : 's'}
          </span>
          <span className="mt-0.5 block text-[10px] text-zinc-500">
            {listExpenseBreakdown(summary.totalByExpenseType)
              .map(line => `${line.shortLabel} ${formatCurrencyCents(line.amount)}`)
              .join(' · ')}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {summary.months.map(month => {
          const isActive = activeFilter === month.key;
          return (
            <button
              key={month.key}
              type="button"
              onClick={() => onFilterChange(month.key)}
              aria-pressed={isActive}
              title={`Filtrar comprobantes de ${month.label}`}
              className={`min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${isActive
                ? 'border-teal-400/60 bg-teal-500/15'
                : 'border-zinc-800 bg-[#111115] hover:border-teal-500/35'} ${month.count === 0 ? 'opacity-55' : ''}`}
            >
              <span className={`block text-[10px] font-black uppercase tracking-wider ${isActive ? 'text-teal-300' : 'text-zinc-400'}`}>{month.label}</span>
              <span className="mt-1 block truncate text-xs font-bold font-mono text-white" title={formatCurrencyCents(month.netAmount)}>{formatCurrencyCents(month.netAmount)}</span>
              <span className="mt-0.5 block text-[10px] text-zinc-500">{month.count} comprobante{month.count === 1 ? '' : 's'}</span>
              <ExpenseBreakdownLines byExpenseType={month.byExpenseType} />
            </button>
          );
        })}

        {summary.undated.count > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange('undated')}
            aria-pressed={activeFilter === 'undated'}
            className={`min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${activeFilter === 'undated'
              ? 'border-amber-400/60 bg-amber-500/15'
              : 'border-amber-500/25 bg-amber-500/5 hover:border-amber-500/45'}`}
          >
            <span className="block text-[10px] font-black uppercase tracking-wider text-amber-300">Sin fecha válida</span>
            <span className="mt-1 block truncate text-xs font-bold font-mono text-white" title={formatCurrencyCents(summary.undated.netAmount)}>{formatCurrencyCents(summary.undated.netAmount)}</span>
            <span className="mt-0.5 block text-[10px] text-amber-200/60">{summary.undated.count} para revisar</span>
            <ExpenseBreakdownLines byExpenseType={summary.undated.byExpenseType} />
          </button>
        )}
      </div>

      <p className="sr-only" aria-live="polite">Filtro activo: {activeFilterLabel}.</p>
    </section>
  );
}
