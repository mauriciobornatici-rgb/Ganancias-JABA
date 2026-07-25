import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('DELETE de comprobantes mensuales', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/clientes/[id]/fiscal-periods/[periodId]/documents/route.ts'),
    'utf8',
  );
  const workspace = readFileSync(
    join(process.cwd(), 'src/app/clientes/[id]/periodos-fiscales/[periodId]/liquidacion-iva/VatSettlementWorkspace.tsx'),
    'utf8',
  );

  it('exige autenticación y respeta el bloqueo de períodos cerrados', () => {
    expect(route).toContain('export async function DELETE');
    expect(route).toContain('requireRouteAuth(request)');
    expect(route).toContain('buildFiscalPeriodSourceMutationDecision');
    expect(route).toContain('deleteFiscalDocumentsForPeriod(tx, periodId, direction)');
  });

  it('registra el borrado para auditoría', () => {
    expect(route).toContain("action: 'DELETE'");
    expect(route).toContain("entityType: 'FiscalDocumentBatch'");
    expect(route).toContain('deletedDocuments: result.deleted');
  });

  it('expone el control de borrado y la columna Total en la revisión', () => {
    expect(workspace).toContain('Eliminar compras');
    expect(workspace).toContain('Eliminar ventas');
    expect(workspace).toContain('documents?direction=${direction}');
    expect(workspace).toContain('method: \'DELETE\'');
    expect(workspace).toContain('>Total</th>');
    expect(workspace).toContain('fmt(r.totalAmount)');
  });

  it('controla la imputación al mes: persiste solo lo del período y avisa el resto', () => {
    expect(route).toContain('partitionFiscalDocumentsByPeriod');
    // Solo se persiste la partición del período, nunca el lote completo.
    expect(route).toContain('persistFiscalDocuments(tx, periodId, inPeriod)');
    expect(route).toContain('fiscalDocumentPeriodMismatchMessage');
    // Si NADA pertenece al mes, se bloquea con 422 en vez de escribir.
    expect(route).toContain('fiscalDocumentPeriodRejectionMessage');
    expect(route).toContain('{ status: 422 }');
  });
});
