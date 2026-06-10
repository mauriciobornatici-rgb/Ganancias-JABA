import { z } from 'zod';

/**
 * P31.4 - Validacion de payloads de las rutas de escritura y topes de tamano.
 * Esquemas chicos y explicitos: validan lo que la ruta realmente usa, sin frenar
 * campos adicionales que viajan en el snapshot.
 */

export const MAX_IMPORT_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB por lote de archivos AFIP
export const MAX_DECLARATION_PAYLOAD_BYTES = 6 * 1024 * 1024; // 6 MB por guardado de DDJJ

export const createTaxReturnSchema = z.object({
  cuit: z
    .string()
    .min(11, 'El CUIT debe tener al menos 11 digitos.')
    .max(13, 'El CUIT no puede superar 13 caracteres (XX-XXXXXXXX-X).'),
  clientName: z
    .string()
    .trim()
    .min(1, 'El nombre/razon social es requerido.')
    .max(200, 'El nombre/razon social no puede superar 200 caracteres.'),
  fiscalYear: z.coerce
    .number()
    .int('El periodo fiscal debe ser un anio entero.')
    .min(2018, 'Periodo fiscal fuera de rango (minimo 2018).')
    .max(2100, 'Periodo fiscal fuera de rango.'),
  status: z.string().max(40).optional(),
  taxParameterSetId: z.string().max(64).nullish(),
});

export type CreateTaxReturnInput = z.infer<typeof createTaxReturnSchema>;

/** Devuelve el primer mensaje de error legible, o null si el payload es valido. */
export function firstValidationError(result: { success: boolean; error?: z.ZodError }): string | null {
  if (result.success || !result.error) return null;
  const issue = result.error.issues[0];
  return issue ? issue.message : 'Payload invalido.';
}

/** Tope de tamano declarado por header content-length (mejor esfuerzo; 0 = desconocido). */
export function exceedsContentLength(contentLengthHeader: string | null | undefined, maxBytes: number): boolean {
  const declared = Number(contentLengthHeader ?? 0);
  return Number.isFinite(declared) && declared > maxBytes;
}
