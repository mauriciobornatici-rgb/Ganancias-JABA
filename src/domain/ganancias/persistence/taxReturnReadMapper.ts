export function formatDateForWizardInput(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
}

export function snapshotStringAt(records: unknown, index: number, key: string): string {
  if (!Array.isArray(records)) return '';

  const record = records[index];
  if (!record || typeof record !== 'object') return '';

  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

type DecimalLike = {
  toString(): string;
};

type AxiDynamicReadItem = {
  concept: string;
  type: string;
  amount: DecimalLike;
  date: Date | string | number | null;
  coef: DecimalLike;
  factor: DecimalLike;
  computedAxi: DecimalLike;
};

type AxiStaticReadItem = {
  concept: string;
  section: string;
  categoryKey?: string | null;
  amount: DecimalLike;
  totalAmount?: DecimalLike | null;
  computableAmount?: DecimalLike | null;
  isComputable: boolean;
};

type PatrimonialJustificationReadItem = {
  concept: string;
  column: number;
  amount: DecimalLike;
};

export function mapAxiDynamicItemForWizard(item: AxiDynamicReadItem) {
  return {
    concept: item.concept,
    type: item.type,
    amount: item.amount.toString(),
    date: formatDateForWizardInput(item.date),
    coef: item.coef.toString(),
    factor: item.factor.toString(),
    computedAxi: item.computedAxi.toString(),
  };
}

export function mapAxiStaticItemsForWizard(items: AxiStaticReadItem[]) {
  if (items.length === 0) return null;

  const breakdown: {
    activo: Record<string, { total: string; computable: string }>;
    pasivo: Record<string, { total: string; computable: string }>;
  } = {
    activo: {},
    pasivo: {},
  };

  items.forEach((item) => {
    const categoryKey = item.categoryKey || item.concept;
    const total = (item.totalAmount ?? item.amount).toString();
    const computable = (item.computableAmount ?? (item.isComputable ? item.amount : { toString: () => '0' })).toString();
    const target = item.section === 'PASIVO_TOTAL' ? breakdown.pasivo : breakdown.activo;

    target[categoryKey] = { total, computable };
  });

  return breakdown;
}

export function mapPatrimonialJustificationForWizard(item: PatrimonialJustificationReadItem) {
  return {
    concept: item.concept,
    column: item.column,
    amount: item.amount.toString(),
  };
}
