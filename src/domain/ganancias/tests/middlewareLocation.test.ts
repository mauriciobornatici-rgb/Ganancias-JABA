import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P31 - Hotfix critico de seguridad (2026-06-10): con estructura `src/app`, Next.js solo
 * ejecuta el interceptor de requests si vive dentro de `src/`. Un archivo en la raiz del
 * repo se ignora silenciosamente y deja TODA la app sin autenticacion.
 * Next 16 ademas renombro la convencion: `proxy.ts` (la funcion exportada debe llamarse
 * `proxy`). Este test fija la ubicacion y la convencion correctas.
 */
describe('Ubicacion del proxy/middleware (seguridad)', () => {
  const projectRoot = path.resolve(process.cwd());

  it('el interceptor vive en src/proxy.ts (convencion Next 16 con src/app)', () => {
    expect(existsSync(path.join(projectRoot, 'src', 'proxy.ts'))).toBe(true);
  });

  it('no existen archivos middleware/proxy que Next ignoraria o que generen conflicto E900', () => {
    expect(existsSync(path.join(projectRoot, 'middleware.ts'))).toBe(false);
    expect(existsSync(path.join(projectRoot, 'proxy.ts'))).toBe(false);
    expect(existsSync(path.join(projectRoot, 'src', 'middleware.ts'))).toBe(false);
  });

  it('src/proxy.ts exporta la funcion `proxy` que Next 16 espera', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(path.join(projectRoot, 'src', 'proxy.ts'), 'utf8');
    expect(source).toMatch(/export\s+async\s+function\s+proxy\s*\(/);
    expect(source).toContain('export const config');
  });
});
