import { describe, it, expect } from 'vitest';
import * as xlsx from 'xlsx';
import { parseAfipExportFile } from '../mappers/afipImporter';

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
      // Fila 2: Compra exenta (Importe Ex = 1200)
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
    expect(summary.totalAmount.toNumber()).toBe(22450); // 21250.00 + 1200.00

    expect(summary.purchases![0].netAmount.toNumber()).toBe(21250);
    expect(summary.purchases![0].isExempt).toBe(false);
    expect(summary.purchases![0].invoiceType).toBe('1');
    expect(summary.purchases![0].invoiceNumber).toBe('0004-00000243');
    expect(summary.purchases![0].vendorName).toBe('VAVCOMS.P');
    expect(summary.purchases![0].counterpartyCuit).toBe('307141419');
    expect(summary.purchases![0].ivaAmount?.toNumber()).toBe(3118.75);
    expect(summary.purchases![0].totalAmount?.toNumber()).toBe(25833.75);

    expect(summary.purchases![1].netAmount.toNumber()).toBe(1200);
    expect(summary.purchases![1].isExempt).toBe(true);
    expect(summary.purchases![1].invoiceNumber).toBe('0004-00000244');
  });
});
