import * as xlsx from 'xlsx';
import { Decimal } from 'decimal.js';
import { SalesInput, PurchaseInput, TaxWithholdingInput } from '../types';
import { DEFAULT_PURCHASE_EXPENSE_TYPE } from '../purchaseExpenseType';

export type AfipSheetCell = string | number | boolean | Date | null | undefined;
export type AfipSheetRow = AfipSheetCell[];

/**
 * Lector robusto de comprobantes AFIP/ARCA.
 *
 * Los CSV de "Mis Comprobantes" usan separador ';', codificacion Latin-1 (Windows-1252) y
 * formato numerico argentino ("15123,97"). Si se delega en SheetJS, este interpreta la coma
 * como separador de miles y convierte "15123,97" -> 1512397 (importe x100, error critico de
 * liquidacion). Por eso los CSV se leen como texto plano preservando el valor original, y
 * SheetJS se reserva para los .xlsx reales (donde numeros y fechas ya son tipos nativos).
 */
function isLikelyXlsxBuffer(fileBuffer: Buffer): boolean {
  // Los .xlsx/.xls modernos son contenedores ZIP: empiezan con "PK" (0x50 0x4B).
  return fileBuffer.length >= 2 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
}

function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === separator && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map(c => c.trim());
}

/**
 * Decodifica el CSV detectando el encoding. El export tradicional de AFIP viene en Latin-1
 * (Windows-1252); la consulta web de "Mis Comprobantes" viene en UTF-8 (sin BOM). Se intenta
 * UTF-8 estricto: si el buffer es UTF-8 válido se usa esa lectura; si aparece el carácter de
 * reemplazo (secuencias inválidas -> típico de un archivo Latin-1), se relee como Latin-1.
 */
function decodeAfipCsv(fileBuffer: Buffer): string {
  const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(fileBuffer);
  const text = asUtf8.includes('�') ? fileBuffer.toString('latin1') : asUtf8;
  return text.replace(/^﻿/, '');
}

function parseCsvRows(fileBuffer: Buffer): AfipSheetRow[] {
  const text = decodeAfipCsv(fileBuffer);
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // Autodeteccion de separador: ';' es el de AFIP; se contempla ',' por compatibilidad.
  const header = lines[0];
  const separator = (header.split(';').length >= header.split(',').length) ? ';' : ',';

  return lines.map(line => splitCsvLine(line, separator));
}

export function readAfipSheetRows(fileBuffer: Buffer): AfipSheetRow[] {
  if (isLikelyXlsxBuffer(fileBuffer)) {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as AfipSheetRow[];
  }

  return parseCsvRows(fileBuffer);
}

export interface ImportedDataSummary {
  fileType: 'MisRetenciones' | 'LibroIVAVentas' | 'LibroIVACompras' | 'Desconocido';
  withholdings?: TaxWithholdingInput[];
  sales?: SalesInput[];
  purchases?: PurchaseInput[];
  totalRecords: number;
  totalAmount: Decimal;
  errors: string[];
}

export type AfipExportFileInput = {
  fileName: string;
  fileBuffer: Buffer;
};

export type AfipExpectedFileType = ImportedDataSummary['fileType'];

export type ImportedFileResult = {
  fileName: string;
  fileType: ImportedDataSummary['fileType'];
  totalRecords: number;
  totalAmount: Decimal;
  errors: string[];
  accepted: boolean;
};

export type ImportedMultiFileSummary = ImportedDataSummary & {
  totalFiles: number;
  fileResults: ImportedFileResult[];
};

/**
 * Parsea un buffer de archivo Excel (XLS/XLSX) o CSV exportado desde los portales de ARCA/AFIP
 * y mapea dinámicamente las columnas al formato del sistema de JABA.
 */
export function parseAfipExportFile(
  fileBuffer: Buffer,
  fileName: string
): ImportedDataSummary {
  const errors: string[] = [];
  const totalAmount = new Decimal(0);
  
  try {
    // 1. Leer las filas: CSV como texto plano (preserva "15123,97" y la fecha original),
    //    xlsx via SheetJS. Ver readSheetRows para el detalle del bug que esto evita.
    const rawData = readAfipSheetRows(fileBuffer);
    if (rawData.length === 0) {
      return { fileType: 'Desconocido', totalRecords: 0, totalAmount, errors: ['El archivo está vacío o no posee hojas válidas'] };
    }

    // 2. Detectar tipo de archivo en base a los encabezados de las primeras filas
    const headers = (rawData[0] || []).map(h => String(h).trim().toLowerCase());
    
    // CASO A: "Mis Retenciones" (AFIP)
    // Encabezados estándar: CUIT Agente Ret./Perc., Denominación o Razón Social, Impuesto, Régimen, Fecha, Número Certificado, Importe...
    const isMisRetenciones = headers.some((h: string) => h.includes('cuit agente') || h.includes('agente ret')) &&
                             headers.some((h: string) => h.includes('importe') || h.includes('monto ret'));
    
    // CASO B: "Libro de IVA Ventas" o exportación de "Mis Comprobantes Emitidos"
    const isVentas = !isMisRetenciones && (
      headers.some((h: string) => 
        h.includes('cliente') || 
        h.includes('receptor') || 
        h.includes('comprador') || 
        h.includes('doc. co') || 
        h.includes('denominacia') ||
        h.includes('emitidos')
      ) &&
      headers.some((h: string) => 
        h.includes('neto') || 
        h.includes('gravado') || 
        h.includes('total neto g') ||
        h.includes('total neto') ||
        h.includes('importe tota')
      )
    );

    // CASO C: "Libro de IVA Compras" o exportación de "Mis Comprobantes Recibidos"
    const isCompras = !isMisRetenciones && !isVentas && (
      headers.some((h: string) => 
        h.includes('emisor') || 
        h.includes('proveedor') || 
        h.includes('vendedor') || 
        h.includes('doc. ve') || 
        h.includes('crédito fisc') || 
        h.includes('credito fisc') ||
        h.includes('recibidos') ||
        (h.includes('denominaci') && !h.includes('denominacia'))
      ) &&
      headers.some((h: string) => 
        h.includes('neto') || 
        h.includes('gravado') || 
        h.includes('total neto g') ||
        h.includes('total neto') ||
        h.includes('importe tota')
      )
    );

    if (isMisRetenciones) {
      return parseMisRetenciones(rawData, headers, errors);
    } else if (isVentas) {
      return parseLibroVentas(rawData, headers, errors);
    } else if (isCompras) {
      return parseLibroCompras(rawData, headers, errors);
    } else {
      // Intento secundario: Si la primera fila es vacía, buscar encabezado en fila 2 o 3
      const alternateHeaders = rawData.slice(1, 3).find(row => row.some(c => String(c).toLowerCase().includes('cuit') || String(c).toLowerCase().includes('fecha')));
      if (alternateHeaders) {
        const altHeadersClean = alternateHeaders.map(h => String(h).trim().toLowerCase());
        if (altHeadersClean.some((h: string) => h.includes('cuit agente') || h.includes('agente ret'))) {
          return parseMisRetenciones(rawData.slice(1), altHeadersClean, errors);
        }
      }
      
      return {
        fileType: 'Desconocido',
        totalRecords: 0,
        totalAmount,
        errors: [`No se pudo detectar el formato oficial de AFIP para el archivo: ${fileName}. Verifique los encabezados.`]
      };
    }
  } catch (err: unknown) {
    return {
      fileType: 'Desconocido',
      totalRecords: 0,
      totalAmount,
      errors: [`Error crítico al parsear el archivo: ${errorMessage(err)}`]
    };
  }
}

export function parseAfipExportFiles(
  files: AfipExportFileInput[],
  options: { expectedFileType?: AfipExpectedFileType } = {}
): ImportedMultiFileSummary {
  const expectedFileType = options.expectedFileType;
  const withholdings: TaxWithholdingInput[] = [];
  const sales: SalesInput[] = [];
  const purchases: PurchaseInput[] = [];
  const fileResults: ImportedFileResult[] = [];
  const errors: string[] = [];
  let totalAmount = new Decimal(0);
  let totalRecords = 0;
  let detectedFileType: ImportedDataSummary['fileType'] = expectedFileType || 'Desconocido';

  files.forEach(file => {
    const summary = parseAfipExportFile(file.fileBuffer, file.fileName);
    const fileErrors = summary.errors.map(error => `${file.fileName}: ${error}`);
    const isRecognized = summary.fileType !== 'Desconocido';
    const matchesExpected = !expectedFileType || summary.fileType === expectedFileType;
    const accepted = isRecognized && matchesExpected;

    if (!isRecognized) {
      errors.push(...fileErrors);
    } else if (!matchesExpected) {
      errors.push(
        `${file.fileName}: el archivo detectado como ${summary.fileType} no coincide con el tipo esperado ${expectedFileType}.`
      );
    } else {
      if (!expectedFileType && detectedFileType === 'Desconocido') {
        detectedFileType = summary.fileType;
      }

      withholdings.push(...(summary.withholdings || []));
      sales.push(...(summary.sales || []));
      purchases.push(...(summary.purchases || []));
      totalRecords += summary.totalRecords;
      totalAmount = totalAmount.add(summary.totalAmount);
      errors.push(...fileErrors);
    }

    fileResults.push({
      fileName: file.fileName,
      fileType: summary.fileType,
      totalRecords: summary.totalRecords,
      totalAmount: summary.totalAmount,
      errors: fileErrors,
      accepted,
    });
  });

  return {
    fileType: detectedFileType,
    withholdings,
    sales,
    purchases,
    totalFiles: files.length,
    fileResults,
    totalRecords,
    totalAmount,
    errors,
  };
}

/**
 * Parsea e importa retenciones y percepciones (Mis Retenciones)
 */
function parseMisRetenciones(
  rows: AfipSheetRow[],
  headers: string[],
  errors: string[]
): ImportedDataSummary {
  const withholdings: TaxWithholdingInput[] = [];
  let totalAmount = new Decimal(0);

  // Buscar índices de las columnas clave
  const amountIndex = headers.findIndex(h => h.includes('importe') || h.includes('monto ret'));
  const cuitAgentIndex = findColumnIndex(headers, ['cuit agente', 'agente ret']);
  const agentNameIndex = findColumnIndex(headers, ['denominaci', 'razon social', 'razÃ³n social']);
  const taxCodeIndex = headers.findIndex(h => h === 'impuesto' || h.includes('cod impuesto') || h.includes('cÃ³digo impuesto'));
  
  // Buscar primero la columna que contiene la descripción del impuesto, y si no, la del código del impuesto
  const descIndex = headers.findIndex(h => h.includes('descrip') && h.includes('impuesto'));
  const taxIndex = descIndex !== -1 ? descIndex : headers.findIndex(h => h.includes('impuesto') || h.includes('descrip'));
  const regimeCodeIndex = headers.findIndex(h => h.includes('gimen') && !h.includes('descrip'));
  const regimeDescriptionIndex = headers.findIndex(h => h.includes('descrip') && h.includes('gimen'));
  const dateIndex = findColumnIndex(headers, ['fecha ret', 'fecha']);
  const certificateIndex = findColumnIndex(headers, ['certificado']);
  const operationDescriptionIndex = headers.findIndex(h => h.includes('operaci'));

  // Procesar filas de datos (excluyendo la primera fila de encabezado)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => c === '')) continue;

    try {
      const rawAmount = row[amountIndex];
      if (rawAmount === undefined || rawAmount === '') continue;

      // Limpiar formato monetario español (coma para decimales, punto para miles)
      const amountVal = parseAfipDecimal(rawAmount);
      const taxName = taxIndex !== -1 ? String(row[taxIndex]).trim() : 'Impuesto a las Ganancias';
      const rawTaxCode = textCell(row, taxCodeIndex);

      if (amountVal.isPositive() && !amountVal.isZero()) {
        const isGanancias = taxName.toLowerCase().includes('ganancias') || rawTaxCode === '787' || taxName === '787';
        withholdings.push({
          amount: amountVal,
          taxCode: isGanancias ? 'Ganancias' : 'Otros',
          cuitAgent: textCell(row, cuitAgentIndex) || undefined,
          agentName: textCell(row, agentNameIndex) || undefined,
          taxDescription: taxName || undefined,
          regimeCode: textCell(row, regimeCodeIndex) || undefined,
          regimeDescription: textCell(row, regimeDescriptionIndex) || undefined,
          date: dateIndex !== -1 ? parseAfipDate(row[dateIndex]) : undefined,
          certificateNumber: textCell(row, certificateIndex) || undefined,
          operationDescription: textCell(row, operationDescriptionIndex) || undefined,
        });
        totalAmount = totalAmount.add(amountVal);
      }
    } catch (err: unknown) {
      errors.push(`Fila ${i + 1}: Error al parsear importe '${row[amountIndex]}': ${errorMessage(err)}`);
    }
  }

  return {
    fileType: 'MisRetenciones',
    withholdings,
    totalRecords: withholdings.length,
    totalAmount: totalAmount,
    errors
  };
}

/**
 * Helper para buscar el índice de una columna entre varias opciones por orden de preferencia.
 */
function findColumnIndex(headers: string[], options: string[]): number {
  for (const opt of options) {
    const index = headers.findIndex(h => h.includes(opt));
    if (index !== -1) return index;
  }
  return -1;
}

function textCell(row: AfipSheetRow, index: number, fallback = ''): string {
  if (index === -1) return fallback;
  const value = row[index];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function moneyCell(row: AfipSheetRow, index: number): Decimal {
  return index !== -1 ? parseAfipDecimal(row[index] || 0) : new Decimal(0);
}

function buildInvoiceNumber(row: AfipSheetRow, pointOfSaleIndex: number, numberIndex: number): string | undefined {
  const rawNumber = textCell(row, numberIndex);
  if (!rawNumber) return undefined;

  const rawPointOfSale = textCell(row, pointOfSaleIndex);
  if (!rawPointOfSale) return rawNumber;

  const pointOfSale = rawPointOfSale.padStart(4, '0');
  const number = rawNumber.padStart(8, '0');
  return `${pointOfSale}-${number}`;
}

/**
 * Las Notas de Credito en el export "Mis Comprobantes" de AFIP YA vienen con importe negativo
 * (verificado 2026-06-10 con NC tipo 3 reales: neto -23.785,12). Por eso el importador NO invierte
 * el signo: confia en el que entrega AFIP e importa todo importe distinto de cero (positivos de
 * facturas, negativos de notas de credito), de modo que las devoluciones resten correctamente.
 */

/**
 * Parsea e importa ventas e ingresos (Libro de IVA Ventas / Comprobantes Emitidos)
 */
function parseLibroVentas(
  rows: AfipSheetRow[],
  headers: string[],
  errors: string[]
): ImportedDataSummary {
  const sales: SalesInput[] = [];
  let totalAmount = new Decimal(0);

  const dateIndex = findColumnIndex(headers, ['fecha de em', 'fecha']);
  const invoiceTypeIndex = findColumnIndex(headers, ['tipo de comprobante', 'tipo de com']);
  const pointOfSaleIndex = findColumnIndex(headers, ['punto de ve', 'pto. vta', 'punto de venta']);
  const invoiceNumberIndex = findColumnIndex(headers, ['nro. comprobante', 'numero de c', 'número de c']);
  const customerNameIndex = findColumnIndex(headers, ['cliente', 'denominacia', 'denominacion', 'denominaci']);
  const customerCuitIndex = findColumnIndex(headers, ['nro. doc. co', 'doc. co']);
  const netIndex = findColumnIndex(headers, ['total neto g', 'total neto', 'importe neto', 'neto', 'gravado']);
  const ivaIndex = findColumnIndex(headers, ['total iva', 'iva liquidado', 'importe iva']);
  const totalIndex = findColumnIndex(headers, ['importe total', 'importe tota']);
  const exemptIndex = findColumnIndex(headers, ['importe ex', 'exento']);
  const noGravadoIndex = headers.findIndex(h => 
    h.includes('importe no') || 
    h.includes('no gravado') || 
    (h.includes('importe ne') && !h.includes('importe neto'))
  );

  if (dateIndex === -1) {
    errors.push('No se pudo encontrar la columna de Fecha en el archivo de ventas (ej. "Fecha" o "Fecha de Em").');
    return { fileType: 'LibroIVAVentas', sales, totalRecords: 0, totalAmount, errors };
  }

  if (netIndex === -1 && exemptIndex === -1 && noGravadoIndex === -1) {
    errors.push('No se encontró ninguna columna de importe neto, exento o no gravado en el archivo de ventas.');
    return { fileType: 'LibroIVAVentas', sales, totalRecords: 0, totalAmount, errors };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => c === '')) continue;

    try {
      const dateVal = parseAfipDate(row[dateIndex]);
      const netVal = netIndex !== -1 ? parseAfipDecimal(row[netIndex] || 0) : new Decimal(0);
      const exemptVal = exemptIndex !== -1 ? parseAfipDecimal(row[exemptIndex] || 0) : new Decimal(0);
      const noGravadoVal = noGravadoIndex !== -1 ? parseAfipDecimal(row[noGravadoIndex] || 0) : new Decimal(0);
      const importedDetail = {
        invoiceType: textCell(row, invoiceTypeIndex) || undefined,
        invoiceNumber: buildInvoiceNumber(row, pointOfSaleIndex, invoiceNumberIndex),
        customerName: textCell(row, customerNameIndex) || undefined,
        counterpartyCuit: textCell(row, customerCuitIndex) || undefined,
        ivaAmount: moneyCell(row, ivaIndex),
        totalAmount: moneyCell(row, totalIndex),
      };

      // Importe neto gravado (positivo en facturas, negativo en notas de credito: el signo ya
      // viene de AFIP). Se importa cualquier valor distinto de cero para que las NC resten.
      if (!netVal.isZero()) {
        sales.push({
          date: dateVal,
          netAmount: netVal,
          isExempt: false,
          ...importedDetail,
        });
        totalAmount = totalAmount.add(netVal);
      }

      // Si posee montos exentos o no gravados
      const totalExemptVal = exemptVal.add(noGravadoVal);
      if (!totalExemptVal.isZero()) {
        sales.push({
          date: dateVal,
          netAmount: totalExemptVal,
          isExempt: true, // Marcado como ingreso exento, cumpliendo con la coexistencia solicitada
          ...importedDetail,
        });
        totalAmount = totalAmount.add(totalExemptVal);
      }
    } catch (err: unknown) {
      errors.push(`Fila ${i + 1}: Error de procesamiento: ${errorMessage(err)}`);
    }
  }

  return {
    fileType: 'LibroIVAVentas',
    sales,
    totalRecords: sales.length,
    totalAmount: totalAmount,
    errors
  };
}

/**
 * Codigos AFIP de comprobantes tipo B: no suman a efectos de Ganancias (criterio 2026-07-11).
 * 6 = Factura B, 7 = Nota de Debito B, 8 = Nota de Credito B.
 */
const PURCHASE_B_CODES = new Set([6, 7, 8]);

/**
 * Codigos AFIP de comprobantes tipo C: suman por el Importe Total (criterio 2026-07-11).
 * 11 = Factura C, 12 = Nota de Debito C, 13 = Nota de Credito C, 15 = Recibo C.
 */
const PURCHASE_C_CODES = new Set([11, 12, 13, 15]);

/**
 * Extrae el codigo numerico AFIP de la celda "Tipo de Comprobante".
 * Acepta variantes como "1", "001", "11 - Factura C". Devuelve null si no hay codigo legible.
 */
export function parsePurchaseVoucherCode(rawType: string | undefined): number | null {
  if (!rawType) return null;
  const match = /^\s*0*(\d{1,3})\b/.exec(rawType);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isInteger(code) && code > 0 ? code : null;
}

/**
 * Parsea e importa compras y egresos (Libro de IVA Compras / Comprobantes Recibidos)
 */
function parseLibroCompras(
  rows: AfipSheetRow[],
  headers: string[],
  errors: string[]
): ImportedDataSummary {
  const purchases: PurchaseInput[] = [];
  let totalAmount = new Decimal(0);

  const dateIndex = findColumnIndex(headers, ['fecha de em', 'fecha']);
  const invoiceTypeIndex = findColumnIndex(headers, ['tipo de comprobante', 'tipo de com']);
  const pointOfSaleIndex = findColumnIndex(headers, ['punto de ve', 'pto. vta', 'punto de venta']);
  const invoiceNumberIndex = findColumnIndex(headers, ['nro. comprobante', 'numero de c', 'número de c']);
  // 'denominaci' primero: en AFIP el nombre esta en "Denominación Vendedor". Si se buscara
  // 'vendedor' suelto, matchearia antes "Tipo Doc. Vendedor"/"Nro. Doc. Vendedor" (bug 2026-06-10).
  const vendorNameIndex = findColumnIndex(headers, ['denominaci', 'razon social', 'razón social', 'proveedor', 'emisor']);
  const vendorCuitIndex = findColumnIndex(headers, ['nro. doc. ve', 'doc. ve']);
  const netIndex = findColumnIndex(headers, ['total neto g', 'total neto', 'importe neto', 'neto', 'gravado']);
  const ivaIndex = findColumnIndex(headers, ['total iva', 'credito fisc', 'crédito fisc', 'importe iva']);
  const totalIndex = findColumnIndex(headers, ['importe total', 'importe tota']);
  const exemptIndex = findColumnIndex(headers, ['importe ex', 'exento']);
  const noGravadoIndex = headers.findIndex(h => 
    h.includes('importe no') || 
    h.includes('no gravado') || 
    (h.includes('importe ne') && !h.includes('importe neto'))
  );

  if (dateIndex === -1) {
    errors.push('No se pudo encontrar la columna de Fecha en el archivo de compras (ej. "Fecha" o "Fecha de Em").');
    return { fileType: 'LibroIVACompras', purchases, totalRecords: 0, totalAmount, errors };
  }

  if (netIndex === -1 && exemptIndex === -1 && noGravadoIndex === -1) {
    errors.push('No se encontró ninguna columna de importe neto, exento o no gravado en el archivo de compras.');
    return { fileType: 'LibroIVACompras', purchases, totalRecords: 0, totalAmount, errors };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every(c => c === '')) continue;

    try {
      const dateVal = parseAfipDate(row[dateIndex]);
      const netVal = netIndex !== -1 ? parseAfipDecimal(row[netIndex] || 0) : new Decimal(0);
      const exemptVal = exemptIndex !== -1 ? parseAfipDecimal(row[exemptIndex] || 0) : new Decimal(0);
      const noGravadoVal = noGravadoIndex !== -1 ? parseAfipDecimal(row[noGravadoIndex] || 0) : new Decimal(0);
      const totalVal = totalIndex !== -1 ? parseAfipDecimal(row[totalIndex] || 0) : new Decimal(0);
      const rawInvoiceType = textCell(row, invoiceTypeIndex);
      const voucherCode = parsePurchaseVoucherCode(rawInvoiceType);
      const importedDetail = {
        invoiceType: rawInvoiceType || undefined,
        invoiceNumber: buildInvoiceNumber(row, pointOfSaleIndex, invoiceNumberIndex),
        vendorName: textCell(row, vendorNameIndex) || undefined,
        counterpartyCuit: textCell(row, vendorCuitIndex) || undefined,
        ivaAmount: moneyCell(row, ivaIndex),
        totalAmount: moneyCell(row, totalIndex),
      };

      // Criterio profesional (2026-07-11) por codigo AFIP de comprobante:
      //   A (1, 2, 3)      -> suma el Total Neto Gravado (+ su parte exenta/no gravada como fila aparte).
      //   B (6, 7, 8)      -> NO suma: se importa visible con $0 para conservar la traza.
      //   C (11, 12, 13, 15) -> suma el Importe Total.
      // El signo de AFIP se preserva siempre (una NC recibida viene negativa y resta).
      if (voucherCode !== null && PURCHASE_B_CODES.has(voucherCode)) {
        purchases.push({
          date: dateVal,
          netAmount: new Decimal(0),
          isDeductible: false,
          isExempt: false,
          expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE,
          ...importedDetail,
        });
        continue;
      }

      if (voucherCode !== null && PURCHASE_C_CODES.has(voucherCode)) {
        if (!totalVal.isZero()) {
          purchases.push({
            date: dateVal,
            netAmount: totalVal,
            isDeductible: true,
            isExempt: false,
            expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE,
            ...importedDetail,
          });
          totalAmount = totalAmount.add(totalVal);
        }
        continue;
      }

      // Codigos A y comprobantes sin codigo reconocido: neto gravado con su signo de AFIP.
      if (!netVal.isZero()) {
        purchases.push({
          date: dateVal,
          netAmount: netVal,
          isDeductible: true,
          isExempt: false,
          expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE,
          ...importedDetail,
        });
        totalAmount = totalAmount.add(netVal);
      }

      const totalExemptVal = exemptVal.add(noGravadoVal);
      if (!totalExemptVal.isZero()) {
        purchases.push({
          date: dateVal,
          netAmount: totalExemptVal,
          isDeductible: false, // Por defecto no deducible en ganancias comunes si es exento
          isExempt: true,      // Marcado como egreso exento
          expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE,
          ...importedDetail,
        });
        totalAmount = totalAmount.add(totalExemptVal);
      }

      const sinDiscriminar = netVal.isZero() && totalExemptVal.isZero();

      // Comprobantes SIN codigo reconocido y sin neto/exento discriminado (decision 2026-06-10):
      // se importan usando el Importe Total como gasto deducible.
      if (voucherCode === null && sinDiscriminar && !totalVal.isZero()) {
        purchases.push({
          date: dateVal,
          netAmount: totalVal,
          isDeductible: true,
          isExempt: false,
          expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE,
          ...importedDetail,
        });
        totalAmount = totalAmount.add(totalVal);
      }

      // Comprobante A sin neto gravado ni exento: segun el criterio suma $0, pero se importa
      // visible para no perder la traza del comprobante.
      if (voucherCode !== null && sinDiscriminar && !totalVal.isZero()) {
        purchases.push({
          date: dateVal,
          netAmount: new Decimal(0),
          isDeductible: false,
          isExempt: false,
          expenseType: DEFAULT_PURCHASE_EXPENSE_TYPE,
          ...importedDetail,
        });
      }
    } catch (err: unknown) {
      errors.push(`Fila ${i + 1}: Error de procesamiento: ${errorMessage(err)}`);
    }
  }

  return {
    fileType: 'LibroIVACompras',
    purchases,
    totalRecords: purchases.length,
    totalAmount: totalAmount,
    errors
  };
}

/**
 * Helper para parsear números decimales del formato local argentino (coma para decimales, punto para miles)
 */
export function parseAfipDecimal(val: unknown): Decimal {
  if (val instanceof Decimal) return val;
  if (typeof val === 'number') return new Decimal(val);
  
  let cleanStr = String(val).trim();
  if (cleanStr === '') return new Decimal(0);
  
  // Limpiar signos monetarios
  cleanStr = cleanStr.replace('$', '').replace(' ', '');

  // Detectar formato español: punto para miles y coma para decimales
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    // Si la coma está después del punto, es formato local
    if (cleanStr.indexOf('.') < cleanStr.indexOf(',')) {
      cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    } else {
      // Caso contrario (punto decimal, coma de miles)
      cleanStr = cleanStr.replace(/,/g, '');
    }
  } else if (cleanStr.includes(',')) {
    // Solo tiene comas, reemplazar por punto para parser nativo
    cleanStr = cleanStr.replace(',', '.');
  }

  const parsed = new Decimal(cleanStr);
  if (parsed.isNaN()) {
    throw new Error(`Importe inválido: ${val}`);
  }
  return parsed;
}

/**
 * Helper para parsear fechas de Excel (ya sean strings o seriales numéricos de Excel)
 */
export function parseAfipDate(val: unknown): Date {
  if (val instanceof Date) return val;
  
  // Si es un número serial de Excel (ej: 45657)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    // Excel base date es 30/12/1899 debido a un bug histórico heredado de Lotus 1-2-3
    return new Date((num - 25569) * 86400 * 1000);
  }

  // Si es un String de fecha
  const str = String(val).trim();

  // Formato ISO de AFIP/ARCA: AAAA-MM-DD (el separador es '-' y el primer bloque es el año).
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    // Formato DD/MM/AAAA (con año de 4 dígitos para no confundir con MM/DD/AA).
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed en JS
    const year = parseInt(parts[2], 10);

    if (parts[2].length === 4) {
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Fecha inválida o irreconocible: ${val}`);
  }
  return parsed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
