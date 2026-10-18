/**
 * Mensaje para cuando ningún crédito de IVA del mes entró al importar "Mis Retenciones".
 *
 * Antes la pantalla mostraba siempre el mismo texto genérico, aunque el importador supiera qué pasó
 * con cada fila (otro impuesto, otro mes, error de formato). Con el desglose el contador distingue
 * de un vistazo "el archivo no se pudo leer" de "este mes el cliente no tuvo retenciones de IVA".
 *
 * Función PURA.
 */
export function buildNothingImportedMessage(input: {
  periodLabel: string;
  rowsRead: number;
  ignoredOtherTax: number;
  outOfPeriod: Array<{ date: string }>;
  errors: string[];
}): string {
  const { periodLabel, rowsRead, ignoredOtherTax, outOfPeriod, errors } = input;
  const parts: string[] = [`No se cargó ninguna retención/percepción de IVA de ${periodLabel}.`];

  // El archivo ni siquiera se pudo interpretar (encabezado o columnas): el error lo explica.
  if (rowsRead === 0 || (errors.length > 0 && ignoredOtherTax === 0 && outOfPeriod.length === 0 && errors.length >= rowsRead)) {
    if (errors.length > 0) parts.push(errors[0]);
    else parts.push('El archivo no tiene filas de datos.');
    return parts.join(' ');
  }

  const breakdown: string[] = [];
  if (ignoredOtherTax > 0) breakdown.push(`${ignoredOtherTax} de otros impuestos (Ganancias, impuesto al cheque, etc.)`);
  if (outOfPeriod.length > 0) {
    const months = Array.from(new Set(outOfPeriod.map(item => item.date.slice(3)))).sort();
    breakdown.push(`${outOfPeriod.length} de IVA de otro mes (${months.join(', ')})`);
  }
  if (errors.length > 0) breakdown.push(`${errors.length} con error`);
  parts.push(`El archivo tiene ${rowsRead} fila${rowsRead === 1 ? '' : 's'}${breakdown.length ? `: ${breakdown.join(', ')}` : ''}.`);

  if (ignoredOtherTax === rowsRead) {
    parts.push('Ninguna fila es de IVA (código 767): si el cliente no sufrió retenciones ni percepciones de IVA ese mes, no hay nada que cargar.');
  } else if (outOfPeriod.length > 0) {
    parts.push('Revisá que estés en el período correcto o descargá el archivo filtrando por este mes.');
  }
  if (errors.length > 0) parts.push(`Primer error: ${errors[0]}`);
  return parts.join(' ');
}
