import { Decimal } from 'decimal.js';

/**
 * Desglose de los créditos de la posición mensual de IVA para mostrar en pantalla.
 *
 * El motor (Art. 24, 2º párr.) aplica JUNTOS, contra el saldo técnico, la libre disponibilidad del
 * período anterior y las percepciones/retenciones del período, y devuelve un único `creditsApplied`.
 * La pantalla rotulaba ese total como "Percep./retenc. aplicadas", y "Libre disponibilidad anterior
 * aplicada" mostraba el saldo DISPONIBLE completo: con libre disponibilidad y sin retenciones cargadas,
 * parecía que las retenciones valían lo mismo que el saldo técnico.
 *
 * Las percepciones/retenciones del período se reconstruyen con la identidad del motor:
 *   disponible = libre disp. anterior + percep./retenc. del período = aplicado + libre disp. que arrastra
 *
 * Función PURA. Las cuentas no cambian: sólo cómo se rotulan.
 */
export type VatCreditsDisplay = {
  /** Libre disponibilidad del período anterior que estaba disponible (no necesariamente usada entera). */
  previousFreeAvailable: Decimal;
  /** Percepciones/retenciones/pagos a cuenta de IVA cargados en el período (puede ser negativo por NC). */
  periodCredits: Decimal;
  /** Total aplicado contra el saldo técnico, sumando ambas fuentes. */
  totalApplied: Decimal;
};

type DecimalLike = Decimal | string | number | null | undefined;

const toDecimal = (value: DecimalLike): Decimal => new Decimal(value ?? 0);

export function buildVatCreditsDisplay(input: {
  previousFreeAvailability: DecimalLike;
  creditsApplied: DecimalLike;
  freeAvailabilityBalance: DecimalLike;
}): VatCreditsDisplay {
  const previousFreeAvailable = toDecimal(input.previousFreeAvailability);
  const totalApplied = toDecimal(input.creditsApplied);
  const periodCredits = totalApplied
    .add(toDecimal(input.freeAvailabilityBalance))
    .sub(previousFreeAvailable);
  return { previousFreeAvailable, periodCredits, totalApplied };
}
