import { describe, expect, it } from 'vitest';
import { PARAMETER_UPDATE_TRANSACTION_OPTIONS } from '../persistence/taxParameterPersistence';

describe('taxParameterPersistence', () => {
  it('usa un timeout mayor al default interactivo de Prisma para guardar indices en Hostinger', () => {
    expect(PARAMETER_UPDATE_TRANSACTION_OPTIONS.timeout).toBeGreaterThan(5000);
    expect(PARAMETER_UPDATE_TRANSACTION_OPTIONS.maxWait).toBeGreaterThanOrEqual(5000);
  });
});
