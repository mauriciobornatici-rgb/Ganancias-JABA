export type FiscalImportFeedback = {
  tone: 'success' | 'warning';
  message: string;
};

export type FiscalDocumentImportResult = {
  inserted: number;
  updated: number;
  duplicates: number;
  warnings?: unknown;
};

/**
 * Compone el resultado visible de una importacion mensual. Las advertencias del parser y de
 * imputacion pertenecen al resultado principal: no deben quedar ocultas detras de un aviso verde.
 */
export function buildFiscalDocumentImportFeedback(
  result: FiscalDocumentImportResult,
): FiscalImportFeedback {
  const warnings = Array.isArray(result.warnings)
    ? [...new Set(result.warnings.filter(
      (warning): warning is string => typeof warning === 'string' && warning.trim().length > 0,
    ).map(warning => warning.trim()))]
    : [];

  let message = `Importados ${result.inserted} comprobantes nuevos, ${result.updated} actualizados y ${result.duplicates} sin cambios.`;
  if (warnings.length > 0) {
    message += ` Advertencias: ${warnings.join(' ')}`;
  }

  return {
    tone: warnings.length > 0 ? 'warning' : 'success',
    message,
  };
}
