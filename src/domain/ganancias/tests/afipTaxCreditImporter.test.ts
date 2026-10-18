import { describe, expect, it } from 'vitest';
import * as xlsx from 'xlsx';
import { parseAfipTaxCredits } from '../mappers/afipTaxCreditImporter';
import { buildNothingImportedMessage } from '../presentation/taxCreditImportMessage';

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

  it('lee el export separado por ";" (estándar de ARCA): antes TODAS las filas se descartaban en silencio', () => {
    const header = 'CUIT Agente Ret./Perc.;Impuesto;Regimen;Fecha Ret./Perc.;Numero Certificado;Descripcion Operacion;Importe Ret./Perc.';
    const rows = [
      `30710278071;767;212;04/05/2026;'2026002188;RETENCION;24297,52`,
      `30703088534;767;493;10/05/2026;'4551127;PERCEPCION;744,30`,
      `30710939345;217;094;09/05/2026;'2025000071;RETENCION;6484,73`,
    ];
    const result = parseAfipTaxCredits(
      { fileName: 'ret.csv', fileBuffer: Buffer.from([header, ...rows].join('\r\n'), 'latin1') },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.rowsRead).toBe(3);
    expect(result.totals.count).toBe(2);
    expect(result.totals.withholding).toBe('24297.52');
    expect(result.totals.perception).toBe('744.30');
    expect(result.ignoredOtherTax).toBe(1);
  });

  it('ubica las columnas por encabezado aunque haya columnas extra y otro orden', () => {
    const header = 'CUIT Agente Ret./Perc.;Denominación o Razón Social;Impuesto;Descripción Impuesto;Régimen;Descripción Régimen;Fecha Ret./Perc.;Número Certificado;Descripción Operación;Importe Ret./Perc.';
    const row = `30710278071;BANCO EJEMPLO SA;767;IMPUESTO AL VALOR AGREGADO;212;RETENCIONES IVA;04/05/2026;'2026002188;RETENCION;"1.234,56"`;
    const result = parseAfipTaxCredits(
      { fileName: 'ret.csv', fileBuffer: Buffer.from([header, row].join('\r\n'), 'latin1') },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.totals.count).toBe(1);
    expect(result.totals.withholding).toBe('1234.56');
    expect(result.credits[0].agentCuit).toBe('30710278071');
    expect(result.credits[0].regime).toBe('212');
    expect(result.credits[0].certificateNumber).toBe('2026002188');
  });

  it('lee un .xlsx (números y fechas nativos de Excel)', () => {
    const sheet = xlsx.utils.aoa_to_sheet([
      ['CUIT Agente Ret./Perc.', 'Impuesto', 'Regimen', 'Fecha Ret./Perc.', 'Numero Certificado', 'Descripcion Operacion', 'Importe Ret./Perc.'],
      ['30710278071', 767, 212, 46146, '2026002188', 'RETENCION', 24297.52], // 46146 = 04/05/2026
    ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, 'Retenciones');
    const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = parseAfipTaxCredits({ fileName: 'ret.xlsx', fileBuffer }, { periodYear: 2026, periodMonth: 5 });
    expect(result.errors).toEqual([]);
    expect(result.totals.count).toBe(1);
    expect(result.totals.withholding).toBe('24297.52');
    expect(result.credits[0].issueDate.toISOString().slice(0, 10)).toBe('2026-05-04');
  });

  it('un archivo que no es "Mis Retenciones" devuelve un error que lo dice, no un cero mudo', () => {
    const result = parseAfipTaxCredits(
      { fileName: 'ventas.csv', fileBuffer: Buffer.from('Fecha;Tipo;Punto de Venta;Numero\n04/05/2026;11;5;1870', 'latin1') },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.totals.count).toBe(0);
    expect(result.errors[0]).toContain('no se reconoció el encabezado');
  });

  it('cuenta como error una fila de IVA con importe ilegible en vez de saltearla', () => {
    const result = parseAfipTaxCredits(
      {
        fileName: 'ret.csv',
        fileBuffer: buf([
          `30710278071,767,212,04/05/2026,'1,RETENCION,"abc",'x,04/05/2026,FACTURA,08/06/2026,'0000`,
        ]),
      },
      { periodYear: 2026, periodMonth: 5 },
    );
    expect(result.totals.count).toBe(0);
    expect(result.errors[0]).toContain('importe inválido');
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

describe('buildNothingImportedMessage — por qué no entró nada', () => {
  it('archivo sólo con Ganancias: dice que no hay IVA que cargar', () => {
    const message = buildNothingImportedMessage({
      periodLabel: '09/2026', rowsRead: 48, ignoredOtherTax: 48, outOfPeriod: [], errors: [],
    });
    expect(message).toContain('48 filas: 48 de otros impuestos');
    expect(message).toContain('Ninguna fila es de IVA');
  });

  it('IVA de otros meses: lista los meses y pide revisar el período', () => {
    const message = buildNothingImportedMessage({
      periodLabel: '09/2026',
      rowsRead: 3,
      ignoredOtherTax: 1,
      outOfPeriod: [{ date: '04/08/2026' }, { date: '20/10/2026' }],
      errors: [],
    });
    expect(message).toContain('2 de IVA de otro mes (08/2026, 10/2026)');
    expect(message).toContain('período correcto');
  });

  it('archivo ilegible: muestra el error del lector', () => {
    const message = buildNothingImportedMessage({
      periodLabel: '09/2026', rowsRead: 0, ignoredOtherTax: 0, outOfPeriod: [],
      errors: ['ventas.csv: no se reconoció el encabezado de "Mis Retenciones".'],
    });
    expect(message).toContain('no se reconoció el encabezado');
  });
});
