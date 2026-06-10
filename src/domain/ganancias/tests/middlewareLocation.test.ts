import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P31 - Hotfix critico de seguridad: con estructura `src/app`, Next.js solo ejecuta el
 * middleware si vive en `src/middleware.ts`. Un middleware en la raiz del repo se ignora
 * silenciosamente y deja TODA la app sin autenticacion. Este test fija la ubicacion correcta
 * para que la regresion no vuelva a pasar inadvertida.
 */
describe('Ubicacion del middleware (seguridad)', () => {
  const projectRoot = path.resolve(process.cwd());

  it('el middleware vive en src/middleware.ts (donde Next lo ejecuta con src/app)', () => {
    expect(existsSync(path.join(projectRoot, 'src', 'middleware.ts'))).toBe(true);
  });

  it('no existe un middleware en la raiz que Next ignoraria (y causaria conflicto E900)', () => {
    expect(existsSync(path.join(projectRoot, 'middleware.ts'))).toBe(false);
  });
});
