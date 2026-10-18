import { Decimal } from 'decimal.js';
import { readAfipSheetRows, type AfipSheetCell, type AfipSheetRow } from './afipImporter';

/**
 * Importador del archivo de Retenciones y Percepciones de AFIP/ARCA ("Mis Retenciones").
 *
 * Es UN solo archivo con retenciones y percepciones mezcladas. Se lee con el mismo lector que el
 * importador de Ganancias (`readAfipSheetRows`): CSV separado por ';' o por ',', en Latin-1 o UTF-8,
 * o un .xlsx. Las columnas se ubican por su ENCABEZADO, no por posición fija:
 *   - `Impuesto` = código del tributo (767 = IVA). Solo IVA entra a la liquidación de IVA.
 *   - `Descripcion Operacion` = RETENCION | PERCEPCION.
 *   - `Fecha Ret./Perc.` (DD/MM/YYYY) define el mes de imputación.
 *   - `Importe Ret./Perc.` puede ser negativo (nota de crédito / anulación).
 *
 * Antes se leía por posición y separando solo por coma: un export separado por ';' (el estándar de
 * ARCA) o con columnas extra (denominación, descripciones) quedaba con todas sus filas descartadas
 * en silencio, y la pantalla decía "no se compiló ninguna retención" sin explicar por qué.
 *
 * Estos créditos alimentan el motor de IVA (Art. 24, 2º párr.): se aplican contra el impuesto técnico
 * a ingresar; el excedente queda como saldo de LIBRE DISPONIBILIDAD. El motor ya hace ese cálculo;
 * este importador solo produce los registros.
 */

/** Código AFIP del impuesto IVA en el régimen de retenciones/percepciones. */
const IVA_TAX_CODE = '767';

export type TaxCreditDraft = {
  creditKey: string;
  tax: 'VAT' | 'GROSS_INCOME';
  kind: 'WITHHOLDING' | 'PERCEPTION';
  /** Solo créditos de IIBB: jurisdicción a la que aplican (p. ej. 902 = ARBA). */
  jurisdictionCode?: string;
  agentCuit: string;
  certificateNumber: string;
  issueDate: Date;
  originalAmount: Decimal;
  regime: string;
  source: 'ARCA' | 'ARBA';
  notes: string;
};

export type TaxCreditImportResult = {
  credits: TaxCreditDraft[];
  /** Filas de datos leídas (sin encabezado ni filas vacías). */
  rowsRead: number;
  /** Filas de otros impuestos (Ganancias/IIBB) ignoradas: no aplican contra IVA. */
  ignoredOtherTax: number;
  /** Filas con Fecha Ret./Perc. fuera del mes liquidado (no se cargan). */
  outOfPeriod: Array<{ certificateNumber: string; date: string; amount: string; kind: string }>;
  errors: string[];
  totals: { withholding: string; perception: string; net: string; count: number };
};

type ColumnMap = {
  agentCuit: number;
  taxCode: number;
  taxDescription: number;
  regime: number;
  date: number;
  certificate: number;
  operation: number;
  amount: number;
};

/** Quita comillas y apóstrofo de Excel de un campo. */
function clean(field: string): string {
  let v = field.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v.startsWith("'")) v = v.slice(1);
  return v.trim();
}

function cellText(cell: AfipSheetCell): string {
  if (cell === null || cell === undefined) return '';
  return clean(String(cell));
}

/** Parsea una línea delimitada respetando comillas (el importe va entrecomillado por la coma decimal). */
function splitDelimited(line: string, separator: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === separator && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Algunas descargas/ediciones (típicamente al abrir y guardar en Excel) envuelven la fila ENTERA
 * entre comillas: el lector la devuelve como una sola celda que contiene la fila completa. Se
 * vuelve a separar con el separador que aparezca en esa celda.
 */
function expandWrappedRow(row: AfipSheetRow): AfipSheetRow {
  if (row.length !== 1 || typeof row[0] !== 'string') return row;
  const text = row[0];
  if (text.includes(';')) return splitDelimited(text, ';');
  if (text.includes(',')) return splitDelimited(text, ',');
  return row;
}

function normalizeHeader(cell: AfipSheetCell): string {
  return String(cell ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeaderRow(headers: string[]): boolean {
  return headers.some(h => h.includes('impuesto'))
    && headers.some(h => h.includes('importe') || h.includes('monto'));
}

function mapColumns(headers: string[]): ColumnMap {
  const find = (...predicates: Array<(h: string) => boolean>): number => {
    for (const predicate of predicates) {
      const index = headers.findIndex(predicate);
      if (index !== -1) return index;
    }
    return -1;
  };

  return {
    agentCuit: find(
      h => h.includes('cuit agente') || h.includes('agente ret'),
      h => h.includes('cuit'),
    ),
    taxCode: find(
      h => h === 'impuesto' || h.includes('codigo impuesto') || h.includes('cod. impuesto') || h.includes('cod impuesto'),
      h => h.includes('impuesto') && !h.includes('descrip'),
    ),
    taxDescription: find(h => h.includes('descrip') && h.includes('impuesto')),
    // "gimen" tolera tanto "Régimen" como un acento mal decodificado ("RÃ©gimen").
    regime: find(h => h.includes('gimen') && !h.includes('descrip')),
    date: find(
      h => h.includes('fecha') && (h.includes('ret') || h.includes('perc')),
      h => h.startsWith('fecha'),
    ),
    certificate: find(h => h.includes('certificado')),
    operation: find(h => h.includes('operaci')),
    amount: find(
      h => (h.includes('importe') || h.includes('monto')) && (h.includes('ret') || h.includes('perc')),
      h => h.includes('importe') || h.includes('monto'),
    ),
  };
}

/** Convierte importe argentino ("24.297,52" o "24297,52", con signo) o un número de Excel a Decimal. */
function parseAmount(cell: AfipSheetCell): Decimal | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? new Decimal(cell) : null;
  const raw = cellText(cell).replace(/\$/g, '').replace(/\s/g, '');
  if (raw === '') return null;
  // Punto decimal sin coma (export web en UTF-8: "24297.52"): no confundirlo con separador de miles.
  const plain = /^-?\d+\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, '').replace(',', '.');
  try {
    const value = new Decimal(plain);
    return value.isNaN() ? null : value;
  } catch {
    return null;
  }
}

function utcNoon(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  // Validar que no hubo "rollover" (29/02 en año no bisiesto, 31/04, etc.).
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** Fecha DD/MM/YYYY, AAAA-MM-DD o serial de Excel a Date (UTC mediodía). Null si no existe. */
function parseDate(cell: AfipSheetCell): Date | null {
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? null : utcNoon(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
  }
  if (typeof cell === 'number') {
    // Serial de Excel: días desde 30/12/1899.
    if (cell < 30000 || cell > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86400000);
    return utcNoon(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const raw = cellText(cell);
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return utcNoon(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return utcNoon(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

function isVatRow(row: AfipSheetRow, columns: ColumnMap): boolean {
  const code = columns.taxCode !== -1 ? cellText(row[columns.taxCode]).replace(/^0+/, '') : '';
  if (code !== '') return code === IVA_TAX_CODE;
  // Sin código: se decide por la descripción del impuesto.
  const description = columns.taxDescription !== -1 ? normalizeHeader(row[columns.taxDescription]) : '';
  return description.includes('valor agregado') || /\biva\b/.test(description);
}

function emptyResult(rowsRead: number, errors: string[]): TaxCreditImportResult {
  return {
    credits: [],
    rowsRead,
    ignoredOtherTax: 0,
    outOfPeriod: [],
    errors,
    totals: { withholding: '0.00', perception: '0.00', net: '0.00', count: 0 },
  };
}

export function parseAfipTaxCredits(
  file: { fileName: string; fileBuffer: Buffer },
  options: { periodYear: number; periodMonth: number },
): TaxCreditImportResult {
  const rows = readAfipSheetRows(file.fileBuffer)
    .map(expandWrappedRow)
    .filter(row => row.some(cell => cellText(cell) !== ''));

  // El encabezado puede no estar en la primera fila (títulos en un .xlsx).
  const headerIndex = rows.slice(0, 5).findIndex(row => isHeaderRow(row.map(normalizeHeader)));
  if (headerIndex === -1) {
    const firstRow = (rows[0] ?? []).slice(0, 8).map(cellText).join(' | ');
    return emptyResult(Math.max(rows.length - 1, 0), [
      `${file.fileName}: no se reconoció el encabezado de "Mis Retenciones" (se esperaba una columna "Impuesto" y otra "Importe"). `
        + `Primera fila del archivo: "${firstRow}".`,
    ]);
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const columns = mapColumns(headers);
  const dataRows = rows.slice(headerIndex + 1);

  const missing: string[] = [];
  if (columns.taxCode === -1 && columns.taxDescription === -1) missing.push('Impuesto');
  if (columns.operation === -1) missing.push('Descripción Operación');
  if (columns.date === -1) missing.push('Fecha Ret./Perc.');
  if (columns.amount === -1) missing.push('Importe Ret./Perc.');
  if (missing.length > 0) {
    return emptyResult(dataRows.length, [
      `${file.fileName}: faltan columnas obligatorias (${missing.join(', ')}). `
        + `Columnas encontradas: ${rows[headerIndex].map(cellText).filter(Boolean).join(', ')}.`,
    ]);
  }

  const credits: TaxCreditDraft[] = [];
  const outOfPeriod: TaxCreditImportResult['outOfPeriod'] = [];
  const errors: string[] = [];
  let ignoredOtherTax = 0;
  let withholding = new Decimal(0);
  let perception = new Decimal(0);

  dataRows.forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2; // número de fila tal como lo ve el usuario

    if (!isVatRow(row, columns)) {
      ignoredOtherTax += 1;
      return;
    }

    const opRaw = cellText(row[columns.operation]).toUpperCase();
    const kind: 'WITHHOLDING' | 'PERCEPTION' | null =
      opRaw.startsWith('RETENC') ? 'WITHHOLDING' : opRaw.startsWith('PERCEP') ? 'PERCEPTION' : null;
    if (!kind) {
      errors.push(`Fila ${rowNumber}: tipo de operación no reconocido ("${opRaw}").`);
      return;
    }

    const issueDate = parseDate(row[columns.date]);
    if (!issueDate) {
      errors.push(`Fila ${rowNumber}: fecha inválida ("${cellText(row[columns.date])}").`);
      return;
    }

    const amount = parseAmount(row[columns.amount]);
    if (!amount) {
      errors.push(`Fila ${rowNumber}: importe inválido ("${cellText(row[columns.amount])}").`);
      return;
    }

    const agentCuit = columns.agentCuit !== -1 ? cellText(row[columns.agentCuit]) : '';
    const regime = columns.regime !== -1 ? cellText(row[columns.regime]) : '';
    const certificateNumber = columns.certificate !== -1 ? cellText(row[columns.certificate]) : '';
    const dateLabel = `${String(issueDate.getUTCDate()).padStart(2, '0')}/${String(issueDate.getUTCMonth() + 1).padStart(2, '0')}/${issueDate.getUTCFullYear()}`;

    // Validación de imputación: solo entran las del mes liquidado.
    if (issueDate.getUTCFullYear() !== options.periodYear || issueDate.getUTCMonth() + 1 !== options.periodMonth) {
      outOfPeriod.push({
        certificateNumber,
        date: dateLabel,
        amount: amount.toFixed(2),
        kind: kind === 'WITHHOLDING' ? 'Retención' : 'Percepción',
      });
      return;
    }

    if (kind === 'WITHHOLDING') withholding = withholding.add(amount);
    else perception = perception.add(amount);

    credits.push({
      creditKey: `RETPERC:${agentCuit}:${certificateNumber}:${amount.toFixed(2)}`,
      tax: 'VAT',
      kind,
      agentCuit,
      certificateNumber,
      issueDate,
      originalAmount: amount,
      regime,
      source: 'ARCA',
      notes: `Régimen ${regime} · ${kind === 'WITHHOLDING' ? 'Retención' : 'Percepción'} IVA`,
    });
  });

  return {
    credits,
    rowsRead: dataRows.length,
    ignoredOtherTax,
    outOfPeriod,
    errors,
    totals: {
      withholding: withholding.toFixed(2),
      perception: perception.toFixed(2),
      net: withholding.add(perception).toFixed(2),
      count: credits.length,
    },
  };
}
