import * as xlsx from 'xlsx';

export interface ParsedDeductions {
  minimoNoImponible: number;
  conyuge: number;
  hijo: number;
  hijoIncapacitado: number;
  especialAutonomo: number;
  especialEmprendedor: number;
  especialDependiente: number;
  topeServicioDomestico: number;
  topeSeguroVida: number;
  topeSeguroRetiro: number;
  topeGastosSepelio: number;
  topeInteresHipoteca: number;
  topeGastosEducativos: number;
}

export interface ParsedArt94Bracket {
  fromAmount: number;
  toAmount: number | null;
  fixedAmount: number;
  percentage: number;
  excessOf: number;
}

export interface ParsedIpcIndex {
  monthIndex: number;
  monthName: string;
  ipcValue: number;
  coefficientToDecember?: number;
  sourceYear?: number;
}

export interface ParsedUsefulCoefficients {
  decPreviousToDecCurrent?: number;
  currentYearAverage?: number;
}

export interface ParsedTaxParameterWorkbook {
  deductions: ParsedDeductions;
  brackets: ParsedArt94Bracket[];
  ipc: ParsedIpcIndex[];
  previousYearDecemberIndex?: ParsedIpcIndex;
  usefulCoefficients: ParsedUsefulCoefficients;
  warnings: string[];
}

const DEFAULT_DEDUCTIONS: ParsedDeductions = {
  minimoNoImponible: 4507505.52,
  conyuge: 4245166.13,
  hijo: 2140852.77,
  hijoIncapacitado: 4281705.53,
  especialAutonomo: 15776269.32,
  especialEmprendedor: 18030022.08,
  especialDependiente: 21636026.50,
  topeServicioDomestico: 4507505.52,
  topeSeguroVida: 573817.13,
  topeSeguroRetiro: 573817.13,
  topeGastosSepelio: 996.23,
  topeInteresHipoteca: 20000.00,
  topeGastosEducativos: 1803002.21,
};

const MONTH_NAMES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

type SheetRow = Record<string, unknown>;
type CellRow = unknown[];

export function parseTaxParameterWorkbook(workbook: xlsx.WorkBook, fiscalYear: number): ParsedTaxParameterWorkbook {
  const warnings: string[] = [];
  const deductions = parseDeductions(workbook);
  const brackets = parseArt94Brackets(workbook);
  const { ipc, previousYearDecemberIndex, usefulCoefficients, warnings: ipcWarnings } = parseIpcIndexes(workbook, fiscalYear);

  warnings.push(...ipcWarnings);

  return {
    deductions,
    brackets,
    ipc,
    previousYearDecemberIndex,
    usefulCoefficients,
    warnings,
  };
}

function parseDeductions(workbook: xlsx.WorkBook): ParsedDeductions {
  const sheetName = findSheetName(workbook, ['deduc']) ?? workbook.SheetNames[0];
  if (!sheetName) return DEFAULT_DEDUCTIONS;

  const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: null });
  const rawValues = new Map<string, number>();

  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length < 2) continue;

    const label = normalizeLabel(row[keys[0]]);
    const amount = toNumber(row[keys[1]]);
    if (label && amount !== null) {
      rawValues.set(label, amount);
    }
  }

  return {
    minimoNoImponible: pickValue(rawValues, ['minimonoimponible', 'minimo no imponible', 'mni'], DEFAULT_DEDUCTIONS.minimoNoImponible),
    conyuge: pickValue(rawValues, ['conyuge'], DEFAULT_DEDUCTIONS.conyuge),
    hijo: pickValue(rawValues, ['hijo'], DEFAULT_DEDUCTIONS.hijo),
    hijoIncapacitado: pickValue(rawValues, ['hijoincapacitado', 'hijo incapacitado'], DEFAULT_DEDUCTIONS.hijoIncapacitado),
    especialAutonomo: pickValue(rawValues, ['especialautonomo', 'especial autonomo'], DEFAULT_DEDUCTIONS.especialAutonomo),
    especialEmprendedor: pickValue(rawValues, ['especialemprendedor', 'especial emprendedor'], DEFAULT_DEDUCTIONS.especialEmprendedor),
    especialDependiente: pickValue(rawValues, ['especialdependiente', 'especial dependiente'], DEFAULT_DEDUCTIONS.especialDependiente),
    topeServicioDomestico: pickValue(rawValues, ['topeserviciodomestico', 'servicio domestico'], DEFAULT_DEDUCTIONS.topeServicioDomestico),
    topeSeguroVida: pickValue(rawValues, ['topesegurovida', 'seguro de vida'], DEFAULT_DEDUCTIONS.topeSeguroVida),
    topeSeguroRetiro: pickValue(rawValues, ['topeseguroretiro', 'seguro de retiro'], DEFAULT_DEDUCTIONS.topeSeguroRetiro),
    topeGastosSepelio: pickValue(rawValues, ['topegastossepelio', 'gastos de sepelio'], DEFAULT_DEDUCTIONS.topeGastosSepelio),
    topeInteresHipoteca: pickValue(rawValues, ['topeintereshipoteca', 'intereses hipoteca'], DEFAULT_DEDUCTIONS.topeInteresHipoteca),
    topeGastosEducativos: pickValue(rawValues, ['topegastoseducativos', 'gastos educativos'], DEFAULT_DEDUCTIONS.topeGastosEducativos),
  };
}

function parseArt94Brackets(workbook: xlsx.WorkBook): ParsedArt94Bracket[] {
  const sheetName = findSheetName(workbook, ['escal', 'bracket']) ?? workbook.SheetNames[1];
  if (!sheetName) return [];

  const rows = xlsx.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: null });

  return rows
    .map((row) => {
      const keys = Object.keys(row);
      if (keys.length < 4) return null;

      const from = toNumber(row[keys[0]]) ?? 0;
      const toCell = row[keys[1]];
      const to = isOpenEndedValue(toCell) ? null : toNumber(toCell);
      const fixed = toNumber(row[keys[2]]) ?? 0;
      let percentage = toNumber(row[keys[3]]) ?? 0;
      const excess = toNumber(row[keys[4]]) ?? 0;

      if (percentage > 1) percentage = percentage / 100;

      return {
        fromAmount: from,
        toAmount: to,
        fixedAmount: fixed,
        percentage,
        excessOf: excess,
      };
    })
    .filter((item): item is ParsedArt94Bracket => item !== null);
}

function parseIpcIndexes(
  workbook: xlsx.WorkBook,
  fiscalYear: number
): {
  ipc: ParsedIpcIndex[];
  previousYearDecemberIndex?: ParsedIpcIndex;
  usefulCoefficients: ParsedUsefulCoefficients;
  warnings: string[];
} {
  const warnings: string[] = [];
  const usefulCoefficients: ParsedUsefulCoefficients = {};
  const sheetName = findSheetName(workbook, ['ipc', 'indic', 'coeficiente']) ?? workbook.SheetNames[2];

  if (!sheetName) {
    return { ipc: [], usefulCoefficients, warnings };
  }

  const rows = xlsx.utils.sheet_to_json<CellRow>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });

  const currentYearRows = new Map<number, ParsedIpcIndex>();
  let previousYearDecemberIndex: ParsedIpcIndex | undefined;

  for (const row of rows) {
    captureUsefulCoefficients(row, usefulCoefficients);

    const previousYearIndex = parseDatedIpcRow(row, fiscalYear - 1);
    if (previousYearIndex?.monthIndex === 12) {
      previousYearDecemberIndex = previousYearIndex;
    }

    const datedIndex = parseDatedIpcRow(row, fiscalYear);
    if (datedIndex) {
      currentYearRows.set(datedIndex.monthIndex, datedIndex);
      continue;
    }

    const simpleIndex = parseSimpleMonthIpcRow(row);
    if (simpleIndex && !currentYearRows.has(simpleIndex.monthIndex)) {
      currentYearRows.set(simpleIndex.monthIndex, simpleIndex);
    }
  }

  const ipc = Array.from(currentYearRows.values()).sort((a, b) => a.monthIndex - b.monthIndex);

  if (ipc.length > 0 && ipc.length !== 12) {
    warnings.push(`Se encontraron ${ipc.length} indices IPC para ${fiscalYear}; se esperaban 12 meses.`);
  }

  return { ipc, previousYearDecemberIndex, usefulCoefficients, warnings };
}

function parseDatedIpcRow(row: CellRow, fiscalYear: number): ParsedIpcIndex | null {
  for (let index = 0; index < row.length - 1; index += 1) {
    const serialDate = toNumber(row[index]);
    if (serialDate === null || serialDate < 30000) continue;

    const parsedDate = xlsx.SSF.parse_date_code(serialDate);
    if (!parsedDate || parsedDate.y !== fiscalYear || parsedDate.m < 1 || parsedDate.m > 12) continue;

    const ipcValue = firstNumberAfter(row, index);
    if (ipcValue === null) continue;

    const coefficientToDecember = firstNumberAfter(row, index + 1) ?? undefined;

    return {
      monthIndex: parsedDate.m,
      monthName: MONTH_NAMES[parsedDate.m],
      ipcValue,
      coefficientToDecember,
      sourceYear: parsedDate.y,
    };
  }

  return null;
}

function parseSimpleMonthIpcRow(row: CellRow): ParsedIpcIndex | null {
  for (let index = 0; index < row.length - 1; index += 1) {
    const monthIndex = toNumber(row[index]);
    if (monthIndex === null || monthIndex < 1 || monthIndex > 12 || !Number.isInteger(monthIndex)) continue;

    const ipcValue = firstNumberAfter(row, index);
    if (ipcValue === null) continue;

    return {
      monthIndex,
      monthName: MONTH_NAMES[monthIndex],
      ipcValue,
    };
  }

  return null;
}

function captureUsefulCoefficients(row: CellRow, usefulCoefficients: ParsedUsefulCoefficients): void {
  for (let index = 0; index < row.length; index += 1) {
    const label = normalizeLabel(row[index]);
    if (!label) continue;

    const value = firstNumberAfter(row, index);
    if (value === null) continue;

    if (label.includes('coeficiente dic24') || label.includes('dic24 dic25')) {
      usefulCoefficients.decPreviousToDecCurrent = value;
    }

    if (label.includes('coeficiente prom') || label.includes('prom 2025')) {
      usefulCoefficients.currentYearAverage = value;
    }
  }
}

function firstNumberAfter(row: CellRow, startIndex: number): number | null {
  for (let index = startIndex + 1; index < row.length; index += 1) {
    const value = toNumber(row[index]);
    if (value !== null) return value;
  }

  return null;
}

function findSheetName(workbook: xlsx.WorkBook, candidates: string[]): string | null {
  const normalizedCandidates = candidates.map((candidate) => normalizeLabel(candidate));

  return workbook.SheetNames.find((sheetName) => {
    const normalizedSheet = normalizeLabel(sheetName);
    return normalizedCandidates.some((candidate) => normalizedSheet.includes(candidate));
  }) ?? null;
}

function pickValue(values: Map<string, number>, labels: string[], fallback: number): number {
  for (const label of labels) {
    const normalized = normalizeLabel(label);
    const value = values.get(normalized);
    if (value !== undefined) return value;
  }

  return fallback;
}

function normalizeLabel(value: unknown): string {
  if (value === null || value === undefined) return '';

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value
    .trim()
    .replace(/\$/g, '')
    .replace(/%/g, '')
    .replace(/\s/g, '');

  if (!trimmed) return null;

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  let normalized = trimmed;

  if (hasComma && hasDot) {
    normalized = trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed.replace(/,/g, '');
  } else if (hasComma) {
    normalized = trimmed.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOpenEndedValue(value: unknown): boolean {
  const label = normalizeLabel(value);
  return label === '' || label.includes('y mas') || label.includes('en adelante');
}
