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
