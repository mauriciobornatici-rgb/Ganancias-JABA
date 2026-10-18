import { describe, expect, it } from 'vitest';
import { deleteFiscalDocumentsForPeriod } from '../persistence/fiscalDocumentCleanup';

describe('deleteFiscalDocumentsForPeriod', () => {
  it('limita el borrado al período solicitado y devuelve la cantidad eliminada', async () => {
    let captured: unknown;
    const db = {
      fiscalDocument: {
        deleteMany: async (args: unknown) => {
          captured = args;
          return { count: 113 };
        },
      },
    };

    await expect(deleteFiscalDocumentsForPeriod(db, 'periodo-junio'))
      .resolves.toEqual({ deleted: 113 });
    expect(captured).toEqual({ where: { fiscalPeriodId: 'periodo-junio' } });
  });

  it('permite borrar únicamente compras o ventas sin afectar la otra dirección', async () => {
    let captured: unknown;
    const db = {
      fiscalDocument: {
        deleteMany: async (args: unknown) => {
          captured = args;
          return { count: 12 };
        },
      },
    };

    await expect(deleteFiscalDocumentsForPeriod(db, 'periodo-junio', 'PURCHASE'))
      .resolves.toEqual({ deleted: 12 });
    expect(captured).toEqual({
      where: { fiscalPeriodId: 'periodo-junio', direction: 'PURCHASE' },
    });
  });
});
