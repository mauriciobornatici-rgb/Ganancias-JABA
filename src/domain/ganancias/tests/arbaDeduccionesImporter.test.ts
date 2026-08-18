import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  parseArbaDeducciones,
  readArbaDeduccionesFiles,
} from '../mappers/arbaDeduccionesImporter';

// Líneas reales de una descarga de "Mis Deducciones" de ARBA (junio 2026).
const BANK_LINES = [
  '014035320361305188369533-99924210-901/06/20261100000007722,50',
  '014035320161300517038133-99924210-901/06/20262100000567864,80',
  '011013132001310116196330-50001091-201/06/20262100000015928,52',
].join('\r\n');

const CARD_LINES = [
  '30-52221156-320260602/06/20260000000000000080492500000000000000324,00',
  '30-52221156-320260602/06/20260000000000000080476300000000000000625,00',
  '33-99924210-920260630/06/20260000000000046678372000000000000001587,30',
  '30-60499477-920260612/06/20260000000000000201376000000000000006944,93',
].join('\n');

// Formato oficial de "Descarga para importar": jurisdiccion 902 + CUIT agente + fecha
// + punto de venta + numero + tipo/letra de comprobante + importe percibido.
const PERCEPTION_LINES = [
  '90230-11111111-301/12/2022000300066373FA00000033,68',
  '90230-22222222-527/12/2022002800045649FA00002057,38',
].join('\r\n');

const PERIOD = { periodYear: 2026, periodMonth: 6 };
const file = (fileName: string, content: string) => ({ fileName, fileBuffer: Buffer.from(content, 'latin1') });

describe('parseArbaDeducciones', () => {
  it('archivo -B (bancarias SIRCREB): CBU, banco, fecha e importe; jurisdicción 902', () => {
    const r = parseArbaDeducciones([file('20287592443-202606M-B.txt', BANK_LINES)], PERIOD);
    expect(r.errors).toEqual([]);
    expect(r.credits).toHaveLength(3);
    expect(r.totals.bank).toBe('591515.82'); // 7.722,50 + 567.864,80 + 15.928,52
    expect(r.totals.cards).toBe('0.00');

    const first = r.credits[0];
    expect(first.tax).toBe('GROSS_INCOME');
    expect(first.kind).toBe('WITHHOLDING');
    expect(first.jurisdictionCode).toBe('902');
    expect(first.agentCuit).toBe('33-99924210-9'); // Banco Provincia
    expect(first.certificateNumber).toBe('0140353203613051883695'); // CBU como referencia
    expect(first.originalAmount.toFixed(2)).toBe('7722.50');
    expect(first.issueDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(first.regime).toBe('SIRCREB');
    expect(r.credits[2].agentCuit).toBe('30-50001091-2'); // Banco Nación
  });

  it('archivo -T (tarjetas): agente, comprobante sin ceros e importe', () => {
    const r = parseArbaDeducciones([file('20287592443-202606M-T.txt', CARD_LINES)], PERIOD);
    expect(r.errors).toEqual([]);
    expect(r.credits).toHaveLength(4);
    expect(r.totals.cards).toBe('9481.23'); // 324 + 625 + 1.587,30 + 6.944,93
    expect(r.totals.net).toBe('9481.23');

    expect(r.credits[0].certificateNumber).toBe('804925');
    expect(r.credits[0].agentCuit).toBe('30-52221156-3');
    expect(r.credits[0].regime).toBe('TARJETAS');
    expect(r.credits[2].originalAmount.toFixed(2)).toBe('1587.30');
    expect(r.credits[3].issueDate.toISOString().slice(0, 10)).toBe('2026-06-12');
  });

  it('archivo -P (percepciones): toma el formato descargado de Mis Deducciones de ARBA', () => {
    const r = parseArbaDeducciones(
      [file('27111111118-202212M-P.txt', PERCEPTION_LINES)],
      { periodYear: 2022, periodMonth: 12 },
    );

    expect(r.errors).toEqual([]);
    expect(r.unsupportedFiles).toEqual([]);
    expect(r.credits).toHaveLength(2);
    expect(r.totals.perceptions).toBe('2091.06');
    expect(r.totals.net).toBe('2091.06');

    const first = r.credits[0];
    expect(first.tax).toBe('GROSS_INCOME');
    expect(first.kind).toBe('PERCEPTION');
    expect(first.jurisdictionCode).toBe('902');
    expect(first.agentCuit).toBe('30-11111111-3');
    expect(first.certificateNumber).toBe('0003-00066373');
    expect(first.issueDate.toISOString().slice(0, 10)).toBe('2022-12-01');
    expect(first.originalAmount.toFixed(2)).toBe('33.68');
    expect(first.regime).toBe('PERCEPCIONES');
  });

  it('una nota de crédito en percepciones conserva el importe negativo', () => {
    const r = parseArbaDeducciones(
      [file('percepciones-P.txt', '90230-11111111-303/12/2022000300066374CA-0000033,68')],
      { periodYear: 2022, periodMonth: 12 },
    );

    expect(r.errors).toEqual([]);
    expect(r.credits).toHaveLength(1);
    expect(r.credits[0].originalAmount.toFixed(2)).toBe('-33.68');
    expect(r.totals.perceptions).toBe('-33.68');
  });

  it('las fechas de otro mes quedan fuera del período y no generan créditos', () => {
    const r = parseArbaDeducciones([file('x-B.txt', BANK_LINES)], { periodYear: 2026, periodMonth: 5 });
    expect(r.credits).toHaveLength(0);
    expect(r.outOfPeriod).toHaveLength(3);
    expect(r.outOfPeriod[0].reference).toContain('CBU');
  });

  it('un TXT renombrado se reconoce por la estructura de sus líneas', () => {
    const r = parseArbaDeducciones([file('deducciones-de-mi-señora.txt', CARD_LINES)], PERIOD);
    expect(r.credits).toHaveLength(4);
    expect(r.totals.cards).toBe('9481.23');
  });

  it('un régimen desconocido (-R) se informa sin inventar importes', () => {
    const r = parseArbaDeducciones([file('20287592443-202606M-R.txt', '30-11111111-1retencion-desconocida')], PERIOD);
    expect(r.credits).toHaveLength(0);
    expect(r.unsupportedFiles).toEqual(['20287592443-202606M-R.txt']);
  });

  it('una línea corrupta se reporta con archivo y número de línea sin frenar el resto', () => {
    const r = parseArbaDeducciones([file('x-T.txt', `${CARD_LINES}\nBASURA`)], PERIOD);
    expect(r.credits).toHaveLength(4);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('línea 5');
  });

  it('la clave idempotente es estable: reimportar el mismo archivo no duplicará', () => {
    const a = parseArbaDeducciones([file('x-B.txt', BANK_LINES)], PERIOD);
    const b = parseArbaDeducciones([file('renombrado-B.txt', BANK_LINES)], PERIOD);
    expect(a.credits.map(c => c.creditKey)).toEqual(b.credits.map(c => c.creditKey));
  });
});

describe('readArbaDeduccionesFiles', () => {
  it('abre el ZIP de ARBA tal como se descarga y toma sus TXT internos', async () => {
    const zip = new JSZip();
    zip.file('20287592443-202606M-B.txt', BANK_LINES);
    zip.file('20287592443-202606M-T.txt', CARD_LINES);
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));

    const { entries, errors } = await readArbaDeduccionesFiles([{ fileName: 'IB-20287592443-202606M.zip', fileBuffer: zipBuffer }]);
    expect(errors).toEqual([]);
    expect(entries.map(e => e.fileName).sort()).toEqual(['20287592443-202606M-B.txt', '20287592443-202606M-T.txt']);

    const parsed = parseArbaDeducciones(entries, PERIOD);
    expect(parsed.credits).toHaveLength(7);
    expect(parsed.totals.net).toBe('600997.05'); // 591.515,82 + 9.481,23
  });

  it('rechaza con mensaje claro lo que no es ZIP ni TXT', async () => {
    const { entries, errors } = await readArbaDeduccionesFiles([{ fileName: 'foto.pdf', fileBuffer: Buffer.from('x') }]);
    expect(entries).toHaveLength(0);
    expect(errors[0]).toContain('foto.pdf');
  });

  it('un ZIP sin TXT adentro avisa en lugar de fallar en silencio', async () => {
    const zip = new JSZip();
    zip.file('leeme.pdf', 'no soy un txt');
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    const { entries, errors } = await readArbaDeduccionesFiles([{ fileName: 'IB-x.zip', fileBuffer: zipBuffer }]);
    expect(entries).toHaveLength(0);
    expect(errors[0]).toContain('no contiene archivos TXT');
  });
});
