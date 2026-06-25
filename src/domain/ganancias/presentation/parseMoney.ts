/**
 * Parser de importes tolerante al formato de entrada del usuario.
 *
 * Acepta:
 *  - Formato argentino: "1.234.567,89" (punto = miles, coma = decimal).
 *  - Punto decimal (teclado numérico): "1234567.89".
 *  - Formato US con miles: "1,234,567.89".
 *  - Enteros: "1234567".
 *
 * Regla: si hay coma y punto, el ÚLTIMO separador es el decimal. Si hay solo coma, es decimal. Si hay
 * solo punto: uno solo se asume decimal (caso teclado numérico); varios son separadores de miles.
 *
 * Devuelve un string decimal plano ("1234567.89") o null si está vacío o no es numérico.
 * PURO: se usa tanto en el cliente (cotejo en vivo) como en el servidor (guardado), para que ambos
 * interpreten los importes igual.
 */
export function parseMoneyToPlain(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\s/g, '');
  if (s === '') return null;

  // Conserva un signo negativo inicial.
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // coma es el decimal → puntos son miles
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // punto es el decimal → comas son miles
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // una sola coma decimal (si hubiera más de una, las anteriores son miles)
    const parts = s.split(',');
    const dec = parts.pop();
    s = parts.join('') + '.' + dec;
  } else if (hasDot) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) {
      s = s.replace(/\./g, ''); // varios puntos = miles
    }
    // un solo punto: se asume decimal (teclado numérico) → se deja como está
  }

  const plain = (negative ? '-' : '') + s;
  const n = Number(plain);
  return Number.isNaN(n) ? null : plain;
}
