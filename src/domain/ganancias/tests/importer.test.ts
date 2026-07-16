import { describe, it, expect } from 'vitest';
import * as xlsx from 'xlsx';
import { parseAfipExportFile, parseAfipExportFiles } from '../mappers/afipImporter';

function workbookBuffer(data: unknown[][], sheetName = 'AFIP') {
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('JABA AFIP Spreadsheet Importer Tests', () => {
  
  it('Debe parsear e importar correctamente un archivo de "Mis Retenciones"', () => {
    // 1. Crear datos virtuales en formato de matriz
    const headers = [
      'CUIT Agente Ret./Perc.',
      'Denominación o Razón Social',
      'Impuesto',
      'Descripción Impuesto',
      'Régimen',
      'Descripción Régimen',
      'Fecha Ret./Perc.',
      'Número Certificado',
      'Descripción Operación',
      'Importe Ret./Perc.'
    ];

    const data = [
      headers,
      ['30-70809010-9', 'Banco Galicia SA', '787', 'RETENCIONES GANANCIAS', '12', 'RET-GANANCIAS REG-12', '15/05/2025', '12345', 'Retención de cuenta', '12500,65'],
      ['33-12345678-9', 'Mercado Libre SRL', '787', 'RETENCIONES GANANCIAS', '35', 'RET-GANANCIAS REG-35', '20/06/2025', '54321', 'Retención cobros digitales', '45800.35'],
      ['30-55555555-5', 'Otro Agente', '103', 'RETENCIONES IVA', '100', 'RET-IVA', '22/07/2025', '99999', 'Retención comercial', '0.00'] // Debe ignorarse por ser 0
    ];

    // 2. Generar el buffer del libro de Excel virtual utilizando sheetjs
    const worksheet = xlsx.utils.aoa_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Retenciones');
    const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 3. Procesar el archivo con nuestro importador
    const summary = parseAfipExportFile(fileBuffer, 'mis_retenciones_2025.xlsx');

    expect(summary.fileType).toBe('MisRetenciones');
    expect(summary.totalRecords).toBe(2); // Las 2 con valores > 0
    expect(summary.errors.length).toBe(0);
    
    // Suma: 12500.65 + 45800.35 = 58301.00
    expect(summary.totalAmount.toNumber()).toBe(58301);
    
    const ret1 = summary.withholdings![0];
    expect(ret1.amount.toNumber()).toBe(12500.65);
    expect(ret1.taxCode).toBe('Ganancias');
    expect(ret1.cuitAgent).toBe('30-70809010-9');
    expect(ret1.agentName).toBe('Banco Galicia SA');
    expect(ret1.taxDescription).toBe('RETENCIONES GANANCIAS');
    expect(ret1.regimeCode).toBe('12');
    expect(ret1.regimeDescription).toBe('RET-GANANCIAS REG-12');
    expect(ret1.date?.toISOString().startsWith('2025-05-15')).toBe(true);
    expect(ret1.certificateNumber).toBe('12345');
    expect(ret1.operationDescription).toBe('Retención de cuenta');

    const ret2 = summary.withholdings![1];
    expect(ret2.amount.toNumber()).toBe(45800.35);
    expect(ret2.taxCode).toBe('Ganancias');
  });

  it('Debe parsear e importar correctamente un "Libro de IVA Ventas" e identificar ingresos exentos', () => {
    const headers = [
      'Fecha',
      'Tipo de comprobante',
      'Nro. Comprobante',
      'Cliente',
      'Neto Gravado',
      'IVA Liquidado',
      'Importe Exento',
      'Importe Total'
    ];

    const data = [
      headers,
      ['10/03/2025', 'Factura A', '0001-00002345', 'Comercializadora SA', '150000.00', '31500.00', '0.00', '181500.00'],
      ['22/04/2025', 'Factura B', '0001-00000120', 'Juan Perez', '0.00', '0.00', '45000.00', '45000.00'] // Ingreso Exento (Monotributo/Exención)
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Ventas');
    const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const summary = parseAfipExportFile(fileBuffer, 'libro_iva_ventas_2025.xlsx');

    expect(summary.fileType).toBe('LibroIVAVentas');
    expect(summary.totalRecords).toBe(2);
    expect(summary.errors.length).toBe(0);
    expect(summary.totalAmount.toNumber()).toBe(195000); // 150.000 + 45.000

    const sale1 = summary.sales![0];
    expect(sale1.netAmount.toNumber()).toBe(150000);
    expect(sale1.isExempt).toBe(false);
    expect(sale1.invoiceType).toBe('Factura A');
    expect(sale1.invoiceNumber).toBe('0001-00002345');
    expect(sale1.customerName).toBe('Comercializadora SA');
    expect(sale1.ivaAmount?.toNumber()).toBe(31500);
    expect(sale1.totalAmount?.toNumber()).toBe(181500);

    const sale2 = summary.sales![1];
    expect(sale2.netAmount.toNumber()).toBe(45000);
    expect(sale2.isExempt).toBe(true); // Exento correctamente detectado
    expect(sale2.invoiceNumber).toBe('0001-00000120');
    expect(sale2.customerName).toBe('Juan Perez');
  });

  it('Debe ser compatible con el formato truncado real de ventas de AFIP/ARCA', () => {
    // Columnas exactas de la captura de pantalla de ventas enviada por el usuario
    const truncatedSalesHeaders = [
      'Fecha de Em', 'Tipo de Com', 'Punto de Ve', 'Número de C', 'Número de C',
      'Tipo Doc. Co', 'Nro. Doc. Co', 'Denominacia', 'Fecha de Ve', 'Importe Tota',
      'Moneda Ori', 'Tipo de Cam', 'Importe Ne', 'Importe Ex', 'Importe de',
      'Importe de', 'Importe de', 'Percepción', 'Importe de', 'Importe Otr',
      'Neto Gravad', 'Neto Gravad', 'Importe IVA', 'Neto Gravad', 'Importe IVA',
      'Neto Gravad', 'Importe IVA', 'Neto Gravad', 'Importe IVA', 'Total Neto G',
      'Total IVA'
    ];

    const data = [
      truncatedSalesHeaders,
      // Fila 1: 3/2/2025 | 1 | 3 | 1529 | 1529 | 80 | 2.43E+10 | OIMASTI LUCIANO | ... | 11200 | PES | 1 | 0 | 0 | ... | Total Neto G = 9256.2 | Total IVA = 1943.8
      [
        '3/2/2025', '1', '3', '1529', '1529',
        '80', '24300000000', 'OIMASTI LUCIANO', '03/02/2025', '11200,00',
        'PES', '1', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '9256,20', '0.00', '1943,80', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '9256,20',
        '1943,80'
      ],
      // Fila 2: Venta exenta
      [
        '05/02/2025', '11', '3', '1530', '1530',
        '80', '24300000000', 'EXENTO CLIENTE', '05/02/2025', '5000,00',
        'PES', '1', '0.00', '5000,00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '0.00'
      ]
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Libro Ventas AFIP');
    const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const summary = parseAfipExportFile(fileBuffer, 'ventas_afip_real.xlsx');

    expect(summary.fileType).toBe('LibroIVAVentas');
    expect(summary.totalRecords).toBe(2);
    expect(summary.errors.length).toBe(0);
    expect(summary.totalAmount.toNumber()).toBe(14256.2); // 9256.20 + 5000.00

    expect(summary.sales![0].netAmount.toNumber()).toBe(9256.2);
    expect(summary.sales![0].isExempt).toBe(false);
    expect(summary.sales![0].invoiceType).toBe('1');
    expect(summary.sales![0].invoiceNumber).toBe('0003-00001529');
    expect(summary.sales![0].customerName).toBe('OIMASTI LUCIANO');
    expect(summary.sales![0].counterpartyCuit).toBe('24300000000');
    expect(summary.sales![0].ivaAmount?.toNumber()).toBe(1943.8);
    expect(summary.sales![0].totalAmount?.toNumber()).toBe(11200);

    expect(summary.sales![1].netAmount.toNumber()).toBe(5000);
    expect(summary.sales![1].isExempt).toBe(true);
    expect(summary.sales![1].invoiceNumber).toBe('0003-00001530');
  });

  it('Debe ser compatible con el formato truncado real de compras de AFIP/ARCA', () => {
    // Columnas exactas de la captura de pantalla de compras enviada por el usuario
    const truncatedPurchasesHeaders = [
      'Fecha de Em', 'Tipo de Com', 'Punto de Ve', 'Número de C', 'Tipo Doc. Ve',
      'Nro. Doc. Ve', 'Denominaci', 'Importe Tota', 'Moneda Orig', 'Tipo de Cam',
      'Importe No', 'Importe Ex', 'Crédito Fisc', 'Importe de', 'Importe de',
      'Importe de', 'Importe de', 'Importe de', 'Importe Otr', 'Neto Gravad',
      'Neto Gravad', 'Importe IVA', 'Neto Gravad', 'Importe IVA', 'Neto Gravad',
      'Importe IVA', 'Neto Gravad', 'Importe IVA', 'Neto Gravad', 'Importe IVA',
      'Total Neto G', 'Total IVA'
    ];

    const data = [
      truncatedPurchasesHeaders,
      // Fila 1: 1/2/2025 | 1 | 4 | 243 | 80 | 307141419 | VAVCOMS.P | 25833,75 | PES | 1 | 0 | 0 | 3118,75 | ... | Total Neto G = 21250 | Total IVA = 3118.75
      [
        '1/2/2025', '1', '4', '243', '80',
        '307141419', 'VAVCOMS.P', '25833,75', 'PES', '1',
        '0.00', '0.00', '3118,75', '0.00', '0.00',
        '0.00', '0.00', '0.00', '1465,00', '21250,00',
        '0.00', '3118,75', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '21250,00', '3118,75'
      ],
      // Fila 2: Factura C (codigo 11) con Importe Exento informado: por criterio C suma Importe Total
      [
        '03/02/2025', '11', '4', '244', '80',
        '307141419', 'EXENTO PROVEEDOR', '1200,00', 'PES', '1',
        '0.00', '1200,00', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '0.00', '0.00', '0.00', '0.00', '0.00',
        '0.00', '0.00'
      ]
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Libro Compras AFIP');
    const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const summary = parseAfipExportFile(fileBuffer, 'compras_afip_real.xlsx');

    expect(summary.fileType).toBe('LibroIVACompras');
    expect(summary.totalRecords).toBe(2);
    expect(summary.errors.length).toBe(0);
    expect(summary.totalAmount.toNumber()).toBe(22450); // 21250.00 (neto A) + 1200.00 (total C)

    expect(summary.purchases![0].netAmount.toNumber()).toBe(21250);
    expect(summary.purchases![0].isExempt).toBe(false);
    expect(summary.purchases![0].expenseType).toBe('MateriaPrima');
    expect(summary.purchases![0].invoiceType).toBe('1');
    expect(summary.purchases![0].invoiceNumber).toBe('0004-00000243');
    expect(summary.purchases![0].vendorName).toBe('VAVCOMS.P');
    expect(summary.purchases![0].counterpartyCuit).toBe('307141419');
    expect(summary.purchases![0].ivaAmount?.toNumber()).toBe(3118.75);
    expect(summary.purchases![0].totalAmount?.toNumber()).toBe(25833.75);

    // Criterio 2026-07-11: codigo 11 siempre suma el Importe Total como gasto deducible.
    expect(summary.purchases![1].netAmount.toNumber()).toBe(1200);
    expect(summary.purchases![1].isExempt).toBe(false);
    expect(summary.purchases![1].isDeductible).toBe(true);
    expect(summary.purchases![1].expenseType).toBe('MateriaPrima');
    expect(summary.purchases![1].invoiceNumber).toBe('0004-00000244');
  });

  it('compila varios archivos mensuales de ventas AFIP como una sola importacion', () => {
    const headers = [
      'Fecha',
      'Tipo de comprobante',
      'Nro. Comprobante',
      'Cliente',
      'Neto Gravado',
      'IVA Liquidado',
      'Importe Exento',
      'Importe Total'
    ];

    const enero = workbookBuffer([
      headers,
      ['10/01/2025', 'Factura A', '0001-00000001', 'Cliente Enero SA', '1000.00', '210.00', '0.00', '1210.00'],
    ], 'Ventas Enero');
    const febrero = workbookBuffer([
      headers,
      ['10/02/2025', 'Factura A', '0001-00000002', 'Cliente Febrero SA', '2000.00', '420.00', '0.00', '2420.00'],
    ], 'Ventas Febrero');

    const summary = parseAfipExportFiles([
      { fileName: 'ventas_01_2025.xlsx', fileBuffer: enero },
      { fileName: 'ventas_02_2025.xlsx', fileBuffer: febrero },
    ], { expectedFileType: 'LibroIVAVentas' });

    expect(summary.fileType).toBe('LibroIVAVentas');
    expect(summary.totalFiles).toBe(2);
    expect(summary.totalRecords).toBe(2);
    expect(summary.totalAmount.toNumber()).toBe(3000);
    expect(summary.fileResults.map(result => result.accepted)).toEqual([true, true]);
    expect(summary.sales?.map(sale => sale.customerName)).toEqual(['Cliente Enero SA', 'Cliente Febrero SA']);
  });

  it('rechaza el archivo mensual que no coincide con el tipo esperado de importacion', () => {
    const ventas = workbookBuffer([
      ['Fecha', 'Tipo de comprobante', 'Nro. Comprobante', 'Cliente', 'Neto Gravado', 'IVA Liquidado', 'Importe Total'],
      ['10/01/2025', 'Factura A', '0001-00000001', 'Cliente Enero SA', '1000.00', '210.00', '1210.00'],
    ], 'Ventas Enero');
    const compras = workbookBuffer([
      ['Fecha', 'Tipo de comprobante', 'Nro. Comprobante', 'Proveedor', 'Neto Gravado', 'Credito Fiscal', 'Importe Total'],
      ['10/02/2025', 'Factura A', '0001-00000002', 'Proveedor Febrero SA', '2000.00', '420.00', '2420.00'],
    ], 'Compras Febrero');

    const summary = parseAfipExportFiles([
      { fileName: 'ventas_01_2025.xlsx', fileBuffer: ventas },
      { fileName: 'compras_02_2025.xlsx', fileBuffer: compras },
    ], { expectedFileType: 'LibroIVAVentas' });

    expect(summary.totalFiles).toBe(2);
    expect(summary.totalRecords).toBe(1);
    expect(summary.sales).toHaveLength(1);
    expect(summary.fileResults[0]).toMatchObject({ fileName: 'ventas_01_2025.xlsx', accepted: true });
    expect(summary.fileResults[1]).toMatchObject({ fileName: 'compras_02_2025.xlsx', fileType: 'LibroIVACompras', accepted: false });
    expect(summary.errors[0]).toContain('compras_02_2025.xlsx');
    expect(summary.errors[0]).toContain('no coincide');
  });

  // Regresion del bug critico detectado el 2026-06-10: los CSV de "Mis Comprobantes" de AFIP
  // usan separador ';', coma decimal ("15123,97") y fecha ISO ("2025-01-02"). Leidos por SheetJS,
  // "15123,97" se convertia en 1512397 (importe x100 -> base imponible 100 veces mayor).
  it('importa CSV real de ventas AFIP sin multiplicar importes por 100 (separador ; y coma decimal)', () => {
    const csv = [
      'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número de Comprobante;Número de Comprobante Hasta;Tipo Doc. Comprador;Nro. Doc. Comprador;Denominación Comprador;Fecha de Vencimiento del Pago;Importe Total;Moneda Original;Tipo de Cambio;Importe No Gravado;Importe Exento;Importe de Per. o Pagos a Cta. de Otros Imp. Nac.;Importe de Percepciones de Ingresos Brutos;Importe de Impuestos Municipales;Percepción a No Categorizados;Importe de Impuestos Internos;Importe Otros Tributos;Neto Gravado IVA 0%;Neto Gravado IVA 2,5%;Importe IVA 2,5%;Neto Gravado IVA 5%;Importe IVA 5%;Neto Gravado IVA 10,5%;Importe IVA 10,5%;Neto Gravado IVA 21%;Importe IVA 21%;Neto Gravado IVA 27%;Importe IVA 27%;Total Neto Gravado;Total IVA',
      '2025-01-02;1;3;1457;1457;80;20255755065;"DESIMONE MARCELO ADRIAN";;18300,00;"PES";1,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;;;;;;;;15123,97;3176,03;;;15123,97;3176,00',
    ].join('\r\n');
    // Codificacion Latin-1 como entrega AFIP.
    const fileBuffer = Buffer.from(csv, 'latin1');

    const summary = parseAfipExportFile(fileBuffer, 'comprobantes_ventas.csv');

    expect(summary.fileType).toBe('LibroIVAVentas');
    expect(summary.totalRecords).toBe(1);
    expect(summary.errors.length).toBe(0);

    const sale = summary.sales![0];
    expect(sale.netAmount.toNumber()).toBe(15123.97); // NO 1512397
    expect(sale.ivaAmount?.toNumber()).toBe(3176);
    expect(sale.totalAmount?.toNumber()).toBe(18300);
    expect(sale.customerName).toBe('DESIMONE MARCELO ADRIAN');
    expect(sale.date?.toISOString().startsWith('2025-01-02')).toBe(true);
  });

  it('importa CSV real de compras AFIP preservando tildes (Latin-1) y fecha ISO', () => {
    const csv = [
      'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número de Comprobante;Tipo Doc. Vendedor;Nro. Doc. Vendedor;Denominación Vendedor;Importe Total;Moneda Original;Tipo de Cambio;Importe No Gravado;Importe Exento;Crédito Fiscal Computable;Importe de Per. o Pagos a Cta. de Otros Imp. Nac.;Importe de Percepciones de Ingresos Brutos;Importe de Impuestos Municipales;Importe de Percepciones o Pagos a Cuenta de IVA;Importe de Impuestos Internos;Importe Otros Tributos;Neto Gravado IVA 0%;Neto Gravado IVA 2,5%;Importe IVA 2,5%;Neto Gravado IVA 5%;Importe IVA 5%;Neto Gravado IVA 10,5%;Importe IVA 10,5%;Neto Gravado IVA 21%;Importe IVA 21%;Neto Gravado IVA 27%;Importe IVA 27%;Total Neto Gravado;Total IVA',
      '2025-01-01;11;1;356;80;27312532897;"AURIERI MARIA ANGELICA";26000,00;"PES";1,00;0,00;0,00;21487,60;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;21487,60;4512,40;0,00;0,00;21487,60;4512,40',
    ].join('\r\n');
    const fileBuffer = Buffer.from(csv, 'latin1');

    const summary = parseAfipExportFile(fileBuffer, 'comprobantes_compras.csv');

    expect(summary.fileType).toBe('LibroIVACompras');
    expect(summary.totalRecords).toBe(1);
    expect(summary.errors.length).toBe(0);

    const purchase = summary.purchases![0];
    // Codigo 11 (Factura C): por criterio 2026-07-11 suma el Importe Total, no el neto discriminado.
    expect(purchase.netAmount.toNumber()).toBe(26000); // NO 2600000 (regresion del parser Latin-1)
    expect(purchase.totalAmount?.toNumber()).toBe(26000);
    expect(purchase.expenseType).toBe('MateriaPrima');
    expect(purchase.vendorName).toBe('AURIERI MARIA ANGELICA');
    expect(purchase.date?.toISOString().startsWith('2025-01-01')).toBe(true);
  });

  it('importa Facturas/Recibos C sin IVA discriminado usando el Importe Total como gasto', () => {
    // Factura C (tipo 11) de monotributista: sin neto gravado discriminado, solo Importe Total.
    const csv = [
      'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número de Comprobante;Tipo Doc. Vendedor;Nro. Doc. Vendedor;Denominación Vendedor;Importe Total;Moneda Original;Tipo de Cambio;Importe No Gravado;Importe Exento;Crédito Fiscal Computable;Importe de Per. o Pagos a Cta. de Otros Imp. Nac.;Importe de Percepciones de Ingresos Brutos;Importe de Impuestos Municipales;Importe de Percepciones o Pagos a Cuenta de IVA;Importe de Impuestos Internos;Importe Otros Tributos;Neto Gravado IVA 0%;Neto Gravado IVA 2,5%;Importe IVA 2,5%;Neto Gravado IVA 5%;Importe IVA 5%;Neto Gravado IVA 10,5%;Importe IVA 10,5%;Neto Gravado IVA 21%;Importe IVA 21%;Neto Gravado IVA 27%;Importe IVA 27%;Total Neto Gravado;Total IVA',
      '2025-01-01;11;1;356;80;27312532897;"AURIERI MARIA ANGELICA";26000,00;"PES";1,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00',
    ].join('\r\n');
    const summary = parseAfipExportFile(Buffer.from(csv, 'latin1'), 'compras_c.csv');

    expect(summary.fileType).toBe('LibroIVACompras');
    expect(summary.totalRecords).toBe(1);
    const purchase = summary.purchases![0];
    expect(purchase.netAmount.toNumber()).toBe(26000); // Importe Total como gasto deducible
    expect(purchase.isDeductible).toBe(true);
    expect(purchase.expenseType).toBe('MateriaPrima');
    expect(purchase.vendorName).toBe('AURIERI MARIA ANGELICA');
  });

  // Criterio profesional 2026-07-11 (tabla del usuario):
  //   codigo 1/2/3 (A)      -> suma Total Neto Gravado (col. AE)
  //   codigo 6/7/8 (B)      -> NO suma (se importa visible con $0)
  //   codigo 11/12/13/15 (C) -> suma Importe Total (col. H)
  it('aplica el criterio por codigo de comprobante en compras: A neto gravado, B no suma, C importe total', () => {
    const header = 'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número de Comprobante;Tipo Doc. Vendedor;Nro. Doc. Vendedor;Denominación Vendedor;Importe Total;Moneda Original;Tipo de Cambio;Importe No Gravado;Importe Exento;Crédito Fiscal Computable;Importe de Per. o Pagos a Cta. de Otros Imp. Nac.;Importe de Percepciones de Ingresos Brutos;Importe de Impuestos Municipales;Importe de Percepciones o Pagos a Cuenta de IVA;Importe de Impuestos Internos;Importe Otros Tributos;Neto Gravado IVA 0%;Neto Gravado IVA 2,5%;Importe IVA 2,5%;Neto Gravado IVA 5%;Importe IVA 5%;Neto Gravado IVA 10,5%;Importe IVA 10,5%;Neto Gravado IVA 21%;Importe IVA 21%;Neto Gravado IVA 27%;Importe IVA 27%;Total Neto Gravado;Total IVA';
    const fila = (codigo: string, total: string, neto: string, exento = '0,00') =>
      `2025-02-05;${codigo};1;100;80;30111111112;"PROVEEDOR";${total};"PES";1,00;0,00;${exento};0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;${neto};0,00;0,00;0,00;${neto};0,00`;

    const csv = [
      header,
      fila('1', '12100,00', '10000,00'),   // Factura A: suma neto 10000
      fila('3', '-2420,00', '-2000,00'),   // NC A: resta neto -2000
      fila('6', '5000,00', '0,00'),        // Factura B: NO suma (visible con $0)
      fila('7', '800,00', '0,00'),         // ND B: NO suma
      fila('11', '3000,00', '0,00'),       // Factura C: suma total 3000
      fila('13', '-500,00', '0,00'),       // NC C: resta total -500
      fila('15', '1500,00', '0,00'),       // Recibo C: suma total 1500
      fila('1', '6050,00', '4000,00', '1000,00'), // Factura A con parte exenta: neto 4000 + fila exenta 1000
    ].join('\r\n');

    const summary = parseAfipExportFile(Buffer.from(csv, 'latin1'), 'compras_criterio.csv');

    expect(summary.fileType).toBe('LibroIVACompras');
    expect(summary.errors.length).toBe(0);

    // Total que suma a efectos de Ganancias: 10000 - 2000 + 0 + 0 + 3000 - 500 + 1500 + 4000 + 1000 = 17000
    expect(summary.totalAmount.toNumber()).toBe(17000);

    const byType = (code: string) => summary.purchases!.filter(p => p.invoiceType === code);

    // A: neto gravado con signo
    expect(byType('1')[0].netAmount.toNumber()).toBe(10000);
    expect(byType('3')[0].netAmount.toNumber()).toBe(-2000);

    // B: importados visibles pero con $0 y no deducibles (no suman en ningun total)
    const facturaB = byType('6')[0];
    expect(facturaB.netAmount.toNumber()).toBe(0);
    expect(facturaB.isDeductible).toBe(false);
    expect(facturaB.totalAmount?.toNumber()).toBe(5000); // traza del importe real
    expect(byType('7')[0].netAmount.toNumber()).toBe(0);

    // C: importe total con signo, deducible
    expect(byType('11')[0].netAmount.toNumber()).toBe(3000);
    expect(byType('11')[0].isDeductible).toBe(true);
    expect(byType('13')[0].netAmount.toNumber()).toBe(-500);
    expect(byType('15')[0].netAmount.toNumber()).toBe(1500);

    // Factura A con parte exenta: fila neto deducible + fila exenta aparte (ambas suman)
    const facturasA = byType('1');
    expect(facturasA).toHaveLength(3); // 10000 + neto 4000 + exenta 1000
    const exenta = facturasA.find(p => p.isExempt);
    expect(exenta?.netAmount.toNumber()).toBe(1000);
  });

  it('importa Notas de Credito preservando el signo negativo de AFIP (restan)', () => {
    // Nota de Credito A (tipo 3): AFIP la entrega con importes ya negativos.
    const csv = [
      'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número de Comprobante;Tipo Doc. Vendedor;Nro. Doc. Vendedor;Denominación Vendedor;Importe Total;Moneda Original;Tipo de Cambio;Importe No Gravado;Importe Exento;Crédito Fiscal Computable;Importe de Per. o Pagos a Cta. de Otros Imp. Nac.;Importe de Percepciones de Ingresos Brutos;Importe de Impuestos Municipales;Importe de Percepciones o Pagos a Cuenta de IVA;Importe de Impuestos Internos;Importe Otros Tributos;Neto Gravado IVA 0%;Neto Gravado IVA 2,5%;Importe IVA 2,5%;Neto Gravado IVA 5%;Importe IVA 5%;Neto Gravado IVA 10,5%;Importe IVA 10,5%;Neto Gravado IVA 21%;Importe IVA 21%;Neto Gravado IVA 27%;Importe IVA 27%;Total Neto Gravado;Total IVA',
      '2025-01-28;3;4264;220776;80;30639453738;"TELECOM ARGENTINA SOCIEDAD ANONIMA";-30088,18;"PES";1,00;0,00;0,00;-4994,88;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;-23785,12;-4994,88;0,00;0,00;-23785,12;-4994,90',
    ].join('\r\n');
    const summary = parseAfipExportFile(Buffer.from(csv, 'latin1'), 'compras_nc.csv');

    expect(summary.fileType).toBe('LibroIVACompras');
    expect(summary.totalRecords).toBe(1);
    const nc = summary.purchases![0];
    expect(nc.netAmount.toNumber()).toBe(-23785.12); // resta de las compras
    expect(summary.totalAmount.toNumber()).toBe(-23785.12);
  });

  it('compila multiples CSV mensuales de AFIP en una sola importacion', () => {
    const header = 'Fecha de Emisión;Tipo de Comprobante;Punto de Venta;Número de Comprobante;Número de Comprobante Hasta;Tipo Doc. Comprador;Nro. Doc. Comprador;Denominación Comprador;Fecha de Vencimiento del Pago;Importe Total;Moneda Original;Tipo de Cambio;Importe No Gravado;Importe Exento;Importe de Per. o Pagos a Cta. de Otros Imp. Nac.;Importe de Percepciones de Ingresos Brutos;Importe de Impuestos Municipales;Percepción a No Categorizados;Importe de Impuestos Internos;Importe Otros Tributos;Neto Gravado IVA 0%;Neto Gravado IVA 2,5%;Importe IVA 2,5%;Neto Gravado IVA 5%;Importe IVA 5%;Neto Gravado IVA 10,5%;Importe IVA 10,5%;Neto Gravado IVA 21%;Importe IVA 21%;Neto Gravado IVA 27%;Importe IVA 27%;Total Neto Gravado;Total IVA';
    const mes = (cuit: string, neto: string) =>
      Buffer.from([header, `2025-03-10;1;3;1000;1000;80;${cuit};"CLIENTE";;1000,00;"PES";1,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;0,00;;;;;;;;${neto};0,00;;;${neto};0,00`].join('\r\n'), 'latin1');

    const summary = parseAfipExportFiles([
      { fileName: 'ventas_enero.csv', fileBuffer: mes('20111111112', '1000,00') },
      { fileName: 'ventas_febrero.csv', fileBuffer: mes('20222222223', '2000,50') },
    ], { expectedFileType: 'LibroIVAVentas' });

    expect(summary.totalFiles).toBe(2);
    expect(summary.totalRecords).toBe(2);
    expect(summary.fileResults.every(r => r.accepted)).toBe(true);
    expect(summary.totalAmount.toNumber()).toBe(3000.5); // 1000 + 2000.50, sin inflar
  });
});
