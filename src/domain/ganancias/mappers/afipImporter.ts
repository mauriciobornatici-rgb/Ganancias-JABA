import * as xlsx from 'xlsx';
import { Decimal } from 'decimal.js';
import { SalesInput, PurchaseInput, TaxWithholdingInput } from '../types';

type SheetCell = string | number | boolean | Date | null | undefined;
type SheetRow = SheetCell[];

export interface ImportedDataSummary {
  fileType: 'MisRetenciones' | 'LibroIVAVentas' | 'LibroIVACompras' | 'Desconocido';
  withholdings?: TaxWithholdingInput[];
  sales?: SalesInput[];
  purchases?: PurchaseInput[];
  totalRecords: number;
  totalAmount: Decimal;
  errors: string[];
}

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
    // 1. Leer el libro utilizando sheetjs
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    
    if (!sheet) {
      return { fileType: 'Desconocido', totalRecords: 0, totalAmount, errors: ['El archivo no posee hojas válidas'] };
    }

    // Convertir a matriz de JSON con valores limpios
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as SheetRow[];
    if (rawData.length === 0) {
      return { fileType: 'Desconocido', totalRecords: 0, totalAmount, errors: ['La hoja de cálculo se encuentra vacía'] };
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

/**
 * Parsea e importa retenciones y percepciones (Mis Retenciones)
 */
function parseMisRetenciones(
  rows: SheetRow[],
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
      const amountVal = parseSpanishDecimal(rawAmount);
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
          date: dateIndex !== -1 ? parseExcelDate(row[dateIndex]) : undefined,
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

function textCell(row: SheetRow, index: number, fallback = ''): string {
  if (index === -1) return fallback;
  const value = row[index];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function moneyCell(row: SheetRow, index: number): Decimal {
  return index !== -1 ? parseSpanishDecimal(row[index] || 0) : new Decimal(0);
}

function buildInvoiceNumber(row: SheetRow, pointOfSaleIndex: number, numberIndex: number): string | undefined {
  const rawNumber = textCell(row, numberIndex);
  if (!rawNumber) return undefined;

  const rawPointOfSale = textCell(row, pointOfSaleIndex);
  if (!rawPointOfSale) return rawNumber;

  const pointOfSale = rawPointOfSale.padStart(4, '0');
  const number = rawNumber.padStart(8, '0');
  return `${pointOfSale}-${number}`;
}

/**
 * Parsea e importa ventas e ingresos (Libro de IVA Ventas / Comprobantes Emitidos)
 */
function parseLibroVentas(
  rows: SheetRow[],
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
      const dateVal = parseExcelDate(row[dateIndex]);
      const netVal = netIndex !== -1 ? parseSpanishDecimal(row[netIndex] || 0) : new Decimal(0);
      const exemptVal = exemptIndex !== -1 ? parseSpanishDecimal(row[exemptIndex] || 0) : new Decimal(0);
      const noGravadoVal = noGravadoIndex !== -1 ? parseSpanishDecimal(row[noGravadoIndex] || 0) : new Decimal(0);
      const importedDetail = {
        invoiceType: textCell(row, invoiceTypeIndex) || undefined,
        invoiceNumber: buildInvoiceNumber(row, pointOfSaleIndex, invoiceNumberIndex),
        customerName: textCell(row, customerNameIndex) || undefined,
        counterpartyCuit: textCell(row, customerCuitIndex) || undefined,
        ivaAmount: moneyCell(row, ivaIndex),
        totalAmount: moneyCell(row, totalIndex),
      };

      // Si tiene importe neto gravado
      if (netVal.gt(0)) {
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
      if (totalExemptVal.gt(0)) {
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
 * Parsea e importa compras y egresos (Libro de IVA Compras / Comprobantes Recibidos)
 */
function parseLibroCompras(
  rows: SheetRow[],
  headers: string[],
  errors: string[]
): ImportedDataSummary {
  const purchases: PurchaseInput[] = [];
  let totalAmount = new Decimal(0);

  const dateIndex = findColumnIndex(headers, ['fecha de em', 'fecha']);
  const invoiceTypeIndex = findColumnIndex(headers, ['tipo de comprobante', 'tipo de com']);
  const pointOfSaleIndex = findColumnIndex(headers, ['punto de ve', 'pto. vta', 'punto de venta']);
  const invoiceNumberIndex = findColumnIndex(headers, ['nro. comprobante', 'numero de c', 'número de c']);
  const vendorNameIndex = findColumnIndex(headers, ['proveedor', 'emisor', 'vendedor', 'denominaci']);
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
      const dateVal = parseExcelDate(row[dateIndex]);
      const netVal = netIndex !== -1 ? parseSpanishDecimal(row[netIndex] || 0) : new Decimal(0);
      const exemptVal = exemptIndex !== -1 ? parseSpanishDecimal(row[exemptIndex] || 0) : new Decimal(0);
      const noGravadoVal = noGravadoIndex !== -1 ? parseSpanishDecimal(row[noGravadoIndex] || 0) : new Decimal(0);
      const importedDetail = {
        invoiceType: textCell(row, invoiceTypeIndex) || undefined,
        invoiceNumber: buildInvoiceNumber(row, pointOfSaleIndex, invoiceNumberIndex),
        vendorName: textCell(row, vendorNameIndex) || undefined,
        counterpartyCuit: textCell(row, vendorCuitIndex) || undefined,
        ivaAmount: moneyCell(row, ivaIndex),
        totalAmount: moneyCell(row, totalIndex),
      };

      if (netVal.gt(0)) {
        purchases.push({
          date: dateVal,
          netAmount: netVal,
          isDeductible: true,
          isExempt: false,
          ...importedDetail,
        });
        totalAmount = totalAmount.add(netVal);
      }

      const totalExemptVal = exemptVal.add(noGravadoVal);
      if (totalExemptVal.gt(0)) {
        purchases.push({
          date: dateVal,
          netAmount: totalExemptVal,
          isDeductible: false, // Por defecto no deducible en ganancias comunes si es exento
          isExempt: true,      // Marcado como egreso exento
          ...importedDetail,
        });
        totalAmount = totalAmount.add(totalExemptVal);
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
function parseSpanishDecimal(val: unknown): Decimal {
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
function parseExcelDate(val: unknown): Date {
  if (val instanceof Date) return val;
  
  // Si es un número serial de Excel (ej: 45657)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    // Excel base date es 30/12/1899 debido a un bug histórico heredado de Lotus 1-2-3
    return new Date((num - 25569) * 86400 * 1000);
  }

  // Si es un String de fecha
  const str = String(val).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    // Intentar formato DD/MM/AAAA
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed en JS
    const year = parseInt(parts[2], 10);
    
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
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
