import { Decimal } from 'decimal.js';

/**
 * Importador del archivo de Retenciones y Percepciones de AFIP/ARCA ("Mis Retenciones").
 *
 * Es UN solo archivo con retenciones y percepciones mezcladas. Formato:
 *   - Separador coma; el importe viene entre comillas con decimal coma ("24297,52"), puede ser negativo.
 *   - Algunos campos traen apóstrofo de Excel ('2026002188) que se elimina.
 *   - Columna `Impuesto` = código del tributo (767 = IVA). Solo IVA entra a la liquidación de IVA.
 *   - Columna `Descripcion Operacion` = RETENCION | PERCEPCION.
 *   - `Fecha Ret./Perc.` (DD/MM/YYYY) define el mes de imputación.
 *
 * Estos créditos alimentan el motor de IVA (Art. 24, 2º párr.): se aplican contra el impuesto técnico
 * a ingresar; el excedente queda como saldo de LIBRE DISPONIBILIDAD. El motor ya hace ese cálculo;
 * este importador solo produce los registros.
 */

/** Código AFIP del impuesto IVA en el régimen de retenciones/percepciones. */
const IVA_TAX_CODE = '767';

export type TaxCreditDraft = {
  creditKey: string;
  tax: 'VAT';
  kind: 'WITHHOLDING' | 'PERCEPTION';
  agentCuit: string;
  certificateNumber: string;
  issueDate: Date;
  originalAmount: Decimal;
  regime: string;
  source: 'ARCA';
  notes: string;
};

export type TaxCreditImportResult = {
  credits: TaxCreditDraft[];
  /** Filas de otros impuestos (Ganancias/IIBB) ignoradas: no aplican contra IVA. */
  ignoredOtherTax: number;
  /** Filas con Fecha Ret./Perc. fuera del mes liquidado (no se cargan). */
  outOfPeriod: Array<{ certificateNumber: string; date: string; amount: string; kind: string }>;
  errors: string[];
  totals: { withholding: string; perception: string; net: string; count: number };
};

/** Quita comillas y apóstrofo de Excel de un campo. */
function clean(field: string): string {
  let v = field.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v.startsWith("'")) v = v.slice(1);
  return v.trim();
}

/** Parsea una línea CSV respetando comillas (el importe va entrecomillado por la coma decimal). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Convierte importe argentino ("24.297,52" o "24297,52", con signo) a Decimal. */
function parseAmount(raw: string): Decimal {
  const plain = clean(raw).replace(/\./g, '').replace(',', '.');
  return new Decimal(plain || '0');
}

/** Parsea DD/MM/YYYY a Date (UTC mediodía). Devuelve null si la fecha no existe (ej. 29/02 no bisiesto). */
function parseDate(raw: string): Date | null {
  const m = clean(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  // Validar que no hubo "rollover" (29/02 en año no bisiesto, 31/04, etc.).
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * Algunas descargas/ediciones (típicamente al abrir y guardar en Excel) envuelven la fila ENTERA
 * entre comillas y duplican las comillas internas: `"a,b,""1,5"",c"`. Las filas normales de AFIP
 * empiezan con el CUIT (un dígito), nunca con comilla. Si la línea viene envuelta, se desenvuelve y
 * se des-duplican las comillas para recuperar el formato estándar antes de parsear.
 */
function unwrapQuotedRow(line: string): string {
  const t = line.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return line;
}

export function parseAfipTaxCredits(
  file: { fileName: string; fileBuffer: Buffer },
  options: { periodYear: number; periodMonth: number },
): TaxCreditImportResult {
  const text = file.fileBuffer.toString('latin1');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const credits: TaxCreditDraft[] = [];
  const outOfPeriod: TaxCreditImportResult['outOfPeriod'] = [];
  const errors: string[] = [];
  let ignoredOtherTax = 0;
  let withholding = new Decimal(0);
  let perception = new Decimal(0);

  // La primera línea es el encabezado.
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(unwrapQuotedRow(lines[i]));
    if (cols.length < 7) continue;

    const taxCode = clean(cols[1]);
    if (taxCode !== IVA_TAX_CODE) {
      ignoredOtherTax += 1;
      continue;
    }

    const opRaw = clean(cols[5]).toUpperCase();
    const kind: 'WITHHOLDING' | 'PERCEPTION' | null =
      opRaw.startsWith('RETENC') ? 'WITHHOLDING' : opRaw.startsWith('PERCEP') ? 'PERCEPTION' : null;
    if (!kind) {
      errors.push(`Fila ${i + 1}: tipo de operación no reconocido ("${opRaw}").`);
      continue;
    }

    const agentCuit = clean(cols[0]);
    const regime = clean(cols[2]);
    const issueDate = parseDate(cols[3]);
    const certificateNumber = clean(cols[4]);
    const amount = parseAmount(cols[6]);

    if (!issueDate) {
      errors.push(`Fila ${i + 1}: fecha inválida ("${clean(cols[3])}").`);
      continue;
    }

    // Validación de imputación: solo entran las del mes liquidado.
    if (issueDate.getUTCFullYear() !== options.periodYear || issueDate.getUTCMonth() + 1 !== options.periodMonth) {
      outOfPeriod.push({
        certificateNumber,
        date: clean(cols[3]),
        amount: amount.toFixed(2),
        kind: kind === 'WITHHOLDING' ? 'Retención' : 'Percepción',
      });
      continue;
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
  }

  return {
    credits,
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
