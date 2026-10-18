import { createHash } from 'node:crypto';

/** Huella determinista del perfil, parámetros y versiones mensuales usados en el cierre. */
export function buildTishSourceFingerprint(sourceSnapshot: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sourceSnapshot))
    .digest('hex');
}

/** Las versiones TISH empiezan en 1 y nunca reemplazan una versión anterior. */
export function nextTishSettlementVersion(latestVersion: number | null | undefined): number {
  return Math.max(0, Math.trunc(latestVersion ?? 0)) + 1;
}
