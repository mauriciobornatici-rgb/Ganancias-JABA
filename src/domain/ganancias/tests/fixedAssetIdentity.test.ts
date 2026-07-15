import { describe, expect, it } from 'vitest';
import { resolveFixedAssetPersistenceIds } from '../persistence/fixedAssetIdentity';

describe('resolveFixedAssetPersistenceIds', () => {
  it('reemplaza de forma estable un id legado ocupado por otra DDJJ', () => {
    const input = {
      taxReturnId: 'return-current',
      requestedIds: ['asset-1'],
      occupiedIdentities: [{ id: 'asset-1', taxReturnId: 'return-other' }],
    };

    const firstResolution = resolveFixedAssetPersistenceIds(input);
    const secondResolution = resolveFixedAssetPersistenceIds(input);

    expect(firstResolution[0]).toMatch(UUID_PATTERN);
    expect(firstResolution[0]).not.toBe('asset-1');
    expect(secondResolution).toEqual(firstResolution);
  });

  it('preserva un id que ya pertenece a la misma DDJJ', () => {
    expect(resolveFixedAssetPersistenceIds({
      taxReturnId: 'return-current',
      requestedIds: ['asset-retired'],
      occupiedIdentities: [{ id: 'asset-retired', taxReturnId: 'return-current' }],
    })).toEqual(['asset-retired']);
  });

  it('aísla por DDJJ un UUID nuevo y deriva otro estable si se repite en el mismo payload', () => {
    const id = '12f3bba8-4dbe-4f24-89fe-9697c8eb1218';

    const result = resolveFixedAssetPersistenceIds({
      taxReturnId: 'return-current',
      requestedIds: [id, id],
      occupiedIdentities: [],
    });

    expect(result[0]).toMatch(UUID_PATTERN);
    expect(result[0]).not.toBe(id);
    expect(result[1]).toMatch(UUID_PATTERN);
    expect(result[1]).not.toBe(result[0]);
  });

  it('deriva ids distintos para el mismo id de navegador en DDJJ diferentes', () => {
    const requestedIds = ['12f3bba8-4dbe-4f24-89fe-9697c8eb1218'];
    const firstReturn = resolveFixedAssetPersistenceIds({
      taxReturnId: 'return-one',
      requestedIds,
      occupiedIdentities: [],
    });
    const secondReturn = resolveFixedAssetPersistenceIds({
      taxReturnId: 'return-two',
      requestedIds,
      occupiedIdentities: [],
    });

    expect(firstReturn[0]).toMatch(UUID_PATTERN);
    expect(secondReturn[0]).toMatch(UUID_PATTERN);
    expect(firstReturn[0]).not.toBe(secondReturn[0]);
  });

  it('normaliza ids nuevos heredados y delega a la base sólo los ids ausentes', () => {
    const result = resolveFixedAssetPersistenceIds({
      taxReturnId: 'return-current',
      requestedIds: ['asset-2', '', undefined],
      occupiedIdentities: [],
    });

    expect(result[0]).toMatch(UUID_PATTERN);
    expect(result.slice(1)).toEqual([undefined, undefined]);
  });
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
