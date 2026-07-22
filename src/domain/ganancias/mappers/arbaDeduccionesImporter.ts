import { Decimal } from 'decimal.js';
import JSZip from 'jszip';
import type { TaxCreditDraft } from './afipTaxCreditImporter';

/**
 * Importador de "Mis Deducciones" de ARBA (Ingresos Brutos, jurisdicción 902).
 *
 * ARBA entrega un ZIP por período (IB-<CUIT>-<AAAAMM>M.zip) con un TXT de ancho fijo por
 * régimen, identificado por el sufijo del nombre de archivo:
 *   -B: deducciones BANCARIAS (SIRCREB).
 *       CBU(22) + CUIT agente(13, con guiones) + fecha(dd/mm/aaaa) + 2 dígitos de
 *       operación + importe(11 enteros, coma, 2 decimales). Largo total: 61.
 *   -T: retenciones por TARJETAS (liquidaciones de tarjetas de crédito/débito).
 *       CUIT agente(13) + período(AAAAMM) + fecha(dd/mm/aaaa) + nº de comprobante(20)
 *       + importe(17 enteros, coma, 2 decimales). Largo total: 69.
 * Otros regímenes del ZIP (-P percepciones, -R retenciones, -A aduaneras) aún no tienen
 * muestra real: se informan como "no soportado" en lugar de adivinar el formato.
 *
 * Se acepta el ZIP tal como se descarga o los TXT sueltos. Los importes alimentan
 * TaxCreditRecord con tax=GROSS_INCOME y jurisdicción 902; el motor de IIBB ya los
 * descuenta del saldo a pagar y la grilla permite excluir líneas antes de liquidar.
 */

export const ARBA_JURISDICTION_CODE = '902';

const BANK_LINE = /^(\d{22})(\d{2}-\d{8}-\d)(\d{2}\/\d{2}\/\d{4})(\d{2})(\d{11},\d{2})$/;
const CARD_LINE = /^(\d{2}-\d{8}-\d)(\d{6})(\d{2}\/\d{2}\/\d{4})(\d{20})(\d{17},\d{2})$/;

export type ArbaImportFile = { fileName: string; fileBuffer: Buffer };

export type ArbaDeduccionesResult = {
  credits: TaxCreditDraft[];
  /** Líneas con fecha fuera del mes liquidado (no se cargan). */
  outOfPeriod: Array<{ file: string; date: string; amount: string; reference: string }>;
  errors: string[];
  /** Archivos del ZIP cuyo régimen todavía no se soporta (p. ej. -P, -R, -A). */
  unsupportedFiles: string[];
  totals: { bank: string; cards: string; net: string; count: number };
};

/**
 * Expande la subida: los ZIP se abren y se toman sus TXT internos; los TXT pasan tal cual.
 * Cualquier otro tipo de archivo se reporta como error sin frenar al resto.
 */
export async function readArbaDeduccionesFiles(
  files: ArbaImportFile[],
): Promise<{ entries: ArbaImportFile[]; errors: string[] }> {
  const entries: ArbaImportFile[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const lower = file.fileName.toLowerCase();
    if (lower.endsWith('.txt')) {
      entries.push(file);
      continue;
    }
    if (lower.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file.fileBuffer);
        const inner = Object.values(zip.files).filter(e => !e.dir && e.name.toLowerCase().endsWith('.txt'));
        if (inner.length === 0) {
          errors.push(`${file.fileName}: el ZIP no contiene archivos TXT de deducciones.`);
          continue;
        }
        for (const entry of inner) {
          entries.push({ fileName: entry.name, fileBuffer: Buffer.from(await entry.async('uint8array')) });
        }
      } catch {
        errors.push(`${file.fileName}: no se pudo abrir el ZIP. Verificá que sea la descarga de ARBA sin modificar.`);
      }
      continue;
    }
    errors.push(`${file.fileName}: formato no reconocido (se acepta el ZIP de ARBA o sus TXT).`);
  }
  return { entries, errors };
}

/** Tipo de régimen de un TXT: por sufijo del nombre o, si está renombrado, por la estructura de la primera línea. */
function detectKind(fileName: string, firstLine: string | undefined): 'BANK' | 'CARDS' | 'UNSUPPORTED' {
  const base = fileName.toLowerCase().replace(/\.txt$/, '');
  if (base.endsWith('-b')) return 'BANK';
  if (base.endsWith('-t')) return 'CARDS';
  if (firstLine && BANK_LINE.test(firstLine)) return 'BANK';
  if (firstLine && CARD_LINE.test(firstLine)) return 'CARDS';
  return 'UNSUPPORTED';
}

/** Importe de ancho fijo ("00000007722,50") a Decimal. */
function parseFixedAmount(raw: string): Decimal {
  return new Decimal(raw.replace(/^0+(?=\d)/, '').replace(',', '.'));
}

/** dd/mm/aaaa a Date UTC mediodía; null si la fecha no existe. */
function parseDate(raw: string): Date | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

export function parseArbaDeducciones(
  entries: ArbaImportFile[],
  options: { periodYear: number; periodMonth: number },
): ArbaDeduccionesResult {
  const credits: TaxCreditDraft[] = [];
  const outOfPeriod: ArbaDeduccionesResult['outOfPeriod'] = [];
  const errors: string[] = [];
  const unsupportedFiles: string[] = [];
  let bank = new Decimal(0);
  let cards = new Decimal(0);

  for (const entry of entries) {
    // Son archivos de dígitos ASCII puros; latin1 nunca corrompe.
    const lines = entry.fileBuffer.toString('latin1').split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const kind = detectKind(entry.fileName, lines[0]);
    if (kind === 'UNSUPPORTED') {
      unsupportedFiles.push(entry.fileName);
      continue;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const match = line.match(kind === 'BANK' ? BANK_LINE : CARD_LINE);
      if (!match) {
        errors.push(`${entry.fileName}, línea ${i + 1}: no respeta el formato ${kind === 'BANK' ? 'bancario (-B)' : 'de tarjetas (-T)'} de ARBA.`);
        continue;
      }

      // B: [cbu, cuit, fecha, op, importe] · T: [cuit, período, fecha, comprobante, importe]
      const isBank = kind === 'BANK';
      const agentCuit = isBank ? match[2] : match[1];
      const dateRaw = match[3];
      const amountRaw = match[5];
      const cbu = isBank ? match[1] : null;
      const opCode = isBank ? match[4] : null;
      const voucher = isBank ? null : match[4].replace(/^0+(?=\d)/, '');

      const issueDate = parseDate(dateRaw);
      const amount = parseFixedAmount(amountRaw);
      if (!issueDate) {
        errors.push(`${entry.fileName}, línea ${i + 1}: fecha inválida ("${dateRaw}").`);
        continue;
      }

      const reference = isBank ? `CBU ${cbu}` : `Comprobante ${voucher}`;
      if (issueDate.getUTCFullYear() !== options.periodYear || issueDate.getUTCMonth() + 1 !== options.periodMonth) {
        outOfPeriod.push({ file: entry.fileName, date: dateRaw, amount: amount.toFixed(2), reference });
        continue;
      }

      if (isBank) bank = bank.add(amount);
      else cards = cards.add(amount);

      credits.push({
        creditKey: isBank
          ? `ARBA-B:${cbu}:${dateRaw}:${opCode}:${amount.toFixed(2)}`
          : `ARBA-T:${agentCuit}:${voucher}:${amount.toFixed(2)}`,
        tax: 'GROSS_INCOME',
        kind: 'WITHHOLDING',
        jurisdictionCode: ARBA_JURISDICTION_CODE,
        agentCuit,
        certificateNumber: isBank ? cbu! : voucher!,
        issueDate,
        originalAmount: amount,
        regime: isBank ? 'SIRCREB' : 'TARJETAS',
        source: 'ARBA',
        notes: isBank
          ? `Deducción bancaria ARBA (SIRCREB) · op. ${opCode}`
          : 'Retención tarjetas ARBA',
      });
    }
  }

  return {
    credits,
    outOfPeriod,
    errors,
    unsupportedFiles,
    totals: { bank: bank.toFixed(2), cards: cards.toFixed(2), net: bank.add(cards).toFixed(2), count: credits.length },
  };
}
