import { describe, expect, it } from 'vitest';
import { parseAfipTaxCredits } from '../mappers/afipTaxCreditImporter';

const HEADER = 'CUIT Agente Ret./Perc.,Impuesto,Regimen,Fecha Ret./Perc.,Numero Certificado,Descripcion Operacion,Importe Ret./Perc.,Numero Comprobante,Fecha Comprobante,Descripcion Comprobante,Fecha Ingreso,Codigo de Seguridad';

function buf(rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join('\r\n'), 'latin1');
}

describe('parseAfipTaxCredits — archivo AFIP de retenciones/percepciones', () => {
  it('separa retenciones y percepciones de IVA (767) y suma neto incluyendo NC negativa', () => {
    const result = parseAfipTaxCredits(
      {
        fileName: 'ret.csv',
        fileBuffer: buf([
          `30710278071,767,212,04/05/2026,'2026002188,RETENCION,"24297,52",'0000000300002224,04/05/2026,FACTURA,08/06/2026,'0000`,
          `30679645907,767,212,14/05/2026,'2026021528,RETENCION,"67338,85",'2000155557,14/05/2026,ORDEN DE PAGO,11/06/2026,'0000`,
          `30703088534,767,493,10/05/2026,'4551127,PERCEPCION,"744,3",'0000004708722697,10/05/2026,FACTURA,11/06/2026,'0000`,
          `30703088534,767,493,16/05/2026,'4828743,PERCEPCION,"-744,3",'0000004700120423,16/05/2026,NOTA DE CREDITO,11/06/2026,'0000`,
        ]),
      },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.totals.withholding).toBe('91636.37'); // 24297.52 + 67338.85
    expect(result.totals.perception).toBe('0.00');      // 744.30 - 744.30 (NC)
    expect(result.totals.net).toBe('91636.37');
    expect(result.totals.count).toBe(4);
    expect(result.credits[0].kind).toBe('WITHHOLDING');
    expect(result.credits[2].kind).toBe('PERCEPTION');
    expect(result.credits[0].certificateNumber).toBe('2026002188'); // sin apóstrofo
    expect(result.credits[0].agentCuit).toBe('30710278071');
  });

  it('ignora impuestos que no sean IVA (767)', () => {
    const result = parseAfipTaxCredits(
      {
        fileName: 'ret.csv',
        fileBuffer: buf([
          `30710278071,767,212,04/05/2026,'1,RETENCION,"1000,00",'x,04/05/2026,FACTURA,08/06/2026,'0000`,
          `30710278071,217,094,04/05/2026,'2,RETENCION,"5000,00",'y,04/05/2026,FACTURA,08/06/2026,'0000`, // Ganancias
        ]),
      },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.totals.count).toBe(1);
    expect(result.ignoredOtherTax).toBe(1);
    expect(result.totals.withholding).toBe('1000.00');
  });

  it('deja fuera (sin cargar) las filas cuya fecha no cae en el mes liquidado', () => {
    const result = parseAfipTaxCredits(
      {
        fileName: 'ret.csv',
        fileBuffer: buf([
          `30710278071,767,212,04/05/2026,'1,RETENCION,"1000,00",'x,04/05/2026,FACTURA,08/06/2026,'0000`,
          `30710278071,767,212,28/04/2026,'2,RETENCION,"2000,00",'y,28/04/2026,FACTURA,08/06/2026,'0000`, // abril
        ]),
      },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.totals.count).toBe(1);
    expect(result.outOfPeriod).toHaveLength(1);
    expect(result.outOfPeriod[0].date).toBe('28/04/2026');
  });

  it('acepta filas envueltas en comillas (re-guardadas por Excel) y las des-encomilla', () => {
    // Cada fila viene como UN campo entrecomillado con comillas internas duplicadas.
    const wrapped = [
      `"30710278071,767,212,04/02/2025,'2026002188,RETENCION,""24297,52"",'x,04/02/2025,FACTURA,08/06/2026,'0000"`,
      `"30703088534,767,493,10/02/2025,'4551127,PERCEPCION,""744,30"",'y,10/02/2025,FACTURA,11/06/2026,'0000"`,
    ];
    const result = parseAfipTaxCredits({ fileName: 'ret.csv', fileBuffer: buf(wrapped) }, { periodYear: 2025, periodMonth: 2 });
    expect(result.totals.count).toBe(2);
    expect(result.totals.withholding).toBe('24297.52');
    expect(result.totals.perception).toBe('744.30');
    expect(result.credits[0].agentCuit).toBe('30710278071');
  });

  it('rechaza fechas inexistentes (29/02 en año no bisiesto) con error claro, no las carga', () => {
    const result = parseAfipTaxCredits(
      {
        fileName: 'ret.csv',
        fileBuffer: buf([
          `30710278071,767,212,28/02/2025,'1,RETENCION,"1000,00",'x,28/02/2025,FACTURA,08/06/2026,'0000`,
          `30710278071,767,212,29/02/2025,'2,RETENCION,"2000,00",'y,29/02/2025,FACTURA,08/06/2026,'0000`, // no existe
        ]),
      },
      { periodYear: 2025, periodMonth: 2 },
    );
    expect(result.totals.count).toBe(1);
    expect(result.errors.some(e => e.includes('29/02/2025'))).toBe(true);
  });

  it('genera claves de idempotencia únicas por certificado/agente/importe', () => {
    const result = parseAfipTaxCredits(
      {
        fileName: 'ret.csv',
        fileBuffer: buf([
          `30710278071,767,212,04/05/2026,'1,RETENCION,"1000,00",'x,04/05/2026,FACTURA,08/06/2026,'0000`,
          `30710278071,767,212,05/05/2026,'2,PERCEPCION,"500,00",'z,05/05/2026,FACTURA,08/06/2026,'0000`,
        ]),
      },
      { periodYear: 2026, periodMonth: 5 },
    );
    const keys = new Set(result.credits.map(c => c.creditKey));
    expect(keys.size).toBe(2);
  });
});
