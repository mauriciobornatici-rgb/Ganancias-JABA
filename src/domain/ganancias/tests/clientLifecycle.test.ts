import { describe, expect, it } from 'vitest';
import {
  canReactivateClient,
  canStartClientWork,
  clientReactivationRequestSchema,
} from '../clients/clientLifecycle';

describe('ciclo de vida de contribuyentes', () => {
  it('solo permite reactivar contribuyentes dados de baja', () => {
    expect(canReactivateClient('Inactivo')).toBe(true);
    expect(canReactivateClient('Activo')).toBe(false);
    expect(canReactivateClient('Suspendido')).toBe(false);
  });

  it('acepta únicamente la acción explícita de reactivación', () => {
    expect(clientReactivationRequestSchema.safeParse({ action: 'reactivate' }).success).toBe(true);
    expect(clientReactivationRequestSchema.safeParse({ action: 'delete' }).success).toBe(false);
    expect(clientReactivationRequestSchema.safeParse({ action: 'reactivate', status: 'Activo' }).success).toBe(false);
  });

  it('impide iniciar trabajo nuevo para un contribuyente dado de baja', () => {
    expect(canStartClientWork('Activo')).toBe(true);
    expect(canStartClientWork('Suspendido')).toBe(true);
    expect(canStartClientWork(undefined)).toBe(true);
    expect(canStartClientWork('Inactivo')).toBe(false);
  });
});
