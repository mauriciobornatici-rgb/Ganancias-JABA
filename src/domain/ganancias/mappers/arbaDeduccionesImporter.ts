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
 *   -P: PERCEPCIONES. Hay dos variantes y se aceptan las dos:
 *       a) ZIP de "Mis Deducciones" (formato real, confirmado con un archivo del usuario 2026-10):
 *          CUIT agente(13) + fecha(dd/mm/aaaa) + tipo(1) + letra(1) + punto de venta(5)
 *          + número(8) + importe(11 enteros, coma, 2 decimales). Largo: 52. Sin "902".
 *          Las percepciones sin comprobante traen tipo/letra en blanco y número en ceros.
 *       b) "Descarga para importar" documentada por ARBA: Jurisdicción(902) + CUIT agente(13)
 *          + fecha + sucursal(4) + emisión(8) + tipo/letra(2) + importe(8 enteros, coma, 2). Largo: 51.
 *       Antes solo se reconocía (b): el ZIP real quedaba con todas sus percepciones rechazadas.
 * Otros regímenes del ZIP (-R retenciones, -A aduaneras) aún no tienen
 * muestra real: se informan como "no soportado" en lugar de adivinar el formato.
 *
 * Se acepta el ZIP tal como se descarga o los TXT sueltos. Los importes alimentan
 * TaxCreditRecord con tax=GROSS_INCOME y jurisdicción 902; el motor de IIBB ya los
 * descuenta del saldo a pagar y la grilla permite excluir líneas antes de liquidar.
 */

export const ARBA_JURISDICTION_CODE = '902';

const BANK_LINE = /^(\d{22})(\d{2}-\d{8}-\d)(\d{2}\/\d{2}\/\d{4})(\d{2})(\d{11},\d{2})$/;
const CARD_LINE = /^(\d{2}-\d{8}-\d)(\d{6})(\d{2}\/\d{2}\/\d{4})(\d{20})(\d{17},\d{2})$/;
// Formato crudo de "Descarga para importar" documentado por ARBA. En notas de crédito,
// el signo reemplaza al primer cero del campo de importe y el largo sigue siendo 51.
const PERCEPTION_LINE = /^(902)(\d{2}-\d{8}-\d)(\d{2}\/\d{2}\/\d{4})(\d{4})(\d{8})([A-Z])([A-Z ])((?:\d{8}|-\d{7})[,.]\d{2})$/;
// Formato del ZIP de "Mis Deducciones" (52 caracteres, sin jurisdicción). Mismo criterio de signo.
const PERCEPTION_LINE_DEDUCCIONES = /^(\d{2}-\d{8}-\d)(\d{2}\/\d{2}\/\d{4})([A-Z ])([A-Z ])(\d{5})(\d{8})((?:\d{11}|-\d{10})[,.]\d{2})$/;

type PerceptionFields = {
  agentCuit: string;
  dateRaw: string;
  pointOfSale: string;
  number: string;
  voucherType: string;
  amountRaw: string;
};

/** Lee una línea de percepciones en cualquiera de los dos formatos; null si no respeta ninguno. */
function matchPerception(line: string): PerceptionFields | null {
  const fromDeducciones = line.match(PERCEPTION_LINE_DEDUCCIONES);
  if (fromDeducciones) {
    return {
      agentCuit: fromDeducciones[1],
      dateRaw: fromDeducciones[2],
      voucherType: `${fromDeducciones[3]}${fromDeducciones[4]}`.trim(),
      pointOfSale: fromDeducciones[5],
      number: fromDeducciones[6],
      amountRaw: fromDeducciones[7],
    };
  }
  const documented = line.match(PERCEPTION_LINE);
  if (documented) {
    return {
      agentCuit: documented[2],
      dateRaw: documented[3],
      pointOfSale: documented[4],
      number: documented[5],
      voucherType: `${documented[6]}${documented[7]}`.trim(),
      amountRaw: documented[8],
    };
  }
  return null;
}

export type ArbaImportFile = { fileName: string; fileBuffer: Buffer };

export type ArbaDeduccionesResult = {
  credits: TaxCreditDraft[];
  /** Líneas con fecha fuera del mes liquidado (no se cargan). */
  outOfPeriod: Array<{ file: string; date: string; amount: string; reference: string }>;
  errors: string[];
  /** Archivos del ZIP cuyo régimen todavía no se soporta (p. ej. -R, -A). */
  unsupportedFiles: string[];
  totals: { bank: string; cards: string; perceptions: string; net: string; count: number };
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
function detectKind(fileName: string, firstLine: string | undefined): 'BANK' | 'CARDS' | 'PERCEPTIONS' | 'UNSUPPORTED' {
  const base = fileName.toLowerCase().replace(/\.txt$/, '');
  if (base.endsWith('-b')) return 'BANK';
  if (base.endsWith('-t')) return 'CARDS';
  if (base.endsWith('-p')) return 'PERCEPTIONS';
  if (firstLine && BANK_LINE.test(firstLine)) return 'BANK';
  if (firstLine && CARD_LINE.test(firstLine)) return 'CARDS';
  if (firstLine && matchPerception(firstLine)) return 'PERCEPTIONS';
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
  let perceptions = new Decimal(0);
  // Dos líneas idénticas (mismo agente, día, comprobante e importe) son dos deducciones distintas:
  // pasa con percepciones sin comprobante. Sin esto la segunda se descartaba como "duplicada".
  // La 1ª ocurrencia conserva su clave de siempre (#2, #3... solo desde la segunda), así lo ya
  // importado sigue siendo idempotente.
  const keyOccurrences = new Map<string, number>();
  const uniqueKey = (key: string): string => {
    const seen = (keyOccurrences.get(key) ?? 0) + 1;
    keyOccurrences.set(key, seen);
    return seen === 1 ? key : `${key}#${seen}`;
  };

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
      const isBank = kind === 'BANK';
      const isCards = kind === 'CARDS';
      // B: [cbu, cuit, fecha, op, importe] · T: [cuit, período, fecha, comprobante, importe]
      const match = isBank ? line.match(BANK_LINE) : isCards ? line.match(CARD_LINE) : null;
      const perception = kind === 'PERCEPTIONS' ? matchPerception(line) : null;
      if (!match && !perception) {
        const format = isBank ? 'bancario (-B)' : isCards ? 'de tarjetas (-T)' : 'de percepciones (-P)';
        errors.push(`${entry.fileName}, línea ${i + 1}: no respeta el formato ${format} de ARBA (${line.length} caracteres: "${line.slice(0, 60)}").`);
        continue;
      }

      const agentCuit = perception ? perception.agentCuit : isBank ? match![2] : match![1];
      const dateRaw = perception ? perception.dateRaw : match![3];
      const amountRaw = perception ? perception.amountRaw : match![5];
      const cbu = isBank ? match![1] : null;
      const opCode = isBank ? match![4] : null;
      const voucher = isCards ? match![4].replace(/^0+(?=\d)/, '') : null;
      // Percepción sin comprobante: tipo en blanco y número en ceros (p. ej. las de bancos).
      const withoutVoucher = perception != null && perception.voucherType === '' && /^0+$/.test(perception.number);
      const perceptionVoucher = perception
        ? (withoutVoucher ? 'S/C' : `${perception.pointOfSale}-${perception.number}`)
        : null;
      const perceptionVoucherType = perception ? (perception.voucherType || 'S/C') : null;

      const issueDate = parseDate(dateRaw);
      const amount = parseFixedAmount(amountRaw);
      if (!issueDate) {
        errors.push(`${entry.fileName}, línea ${i + 1}: fecha inválida ("${dateRaw}").`);
        continue;
      }

      const reference = isBank
        ? `CBU ${cbu}`
        : isCards
          ? `Comprobante ${voucher}`
          : withoutVoucher ? 'Sin comprobante' : `Comprobante ${perceptionVoucherType} ${perceptionVoucher}`;
      if (issueDate.getUTCFullYear() !== options.periodYear || issueDate.getUTCMonth() + 1 !== options.periodMonth) {
        outOfPeriod.push({ file: entry.fileName, date: dateRaw, amount: amount.toFixed(2), reference });
        continue;
      }

      if (isBank) bank = bank.add(amount);
      else if (isCards) cards = cards.add(amount);
      else perceptions = perceptions.add(amount);

      credits.push({
        creditKey: uniqueKey(isBank
          ? `ARBA-B:${cbu}:${dateRaw}:${opCode}:${amount.toFixed(2)}`
          : isCards
            ? `ARBA-T:${agentCuit}:${voucher}:${amount.toFixed(2)}`
            : `ARBA-P:${agentCuit}:${dateRaw}:${perceptionVoucherType}:${perceptionVoucher}:${amount.toFixed(2)}`),
        tax: 'GROSS_INCOME',
        kind: kind === 'PERCEPTIONS' ? 'PERCEPTION' : 'WITHHOLDING',
        jurisdictionCode: ARBA_JURISDICTION_CODE,
        agentCuit,
        certificateNumber: isBank ? cbu! : isCards ? voucher! : perceptionVoucher!,
        issueDate,
        originalAmount: amount,
        regime: isBank ? 'SIRCREB' : isCards ? 'TARJETAS' : 'PERCEPCIONES',
        source: 'ARBA',
        notes: isBank
          ? `Deducción bancaria ARBA (SIRCREB) · op. ${opCode}`
          : isCards
            ? 'Retención tarjetas ARBA'
            : withoutVoucher ? 'Percepción ARBA · sin comprobante' : `Percepción ARBA · comprobante ${perceptionVoucherType}`,
      });
    }
  }

  return {
    credits,
    outOfPeriod,
    errors,
    unsupportedFiles,
    totals: {
      bank: bank.toFixed(2),
      cards: cards.toFixed(2),
      perceptions: perceptions.toFixed(2),
      net: bank.add(cards).add(perceptions).toFixed(2),
      count: credits.length,
    },
  };
}
