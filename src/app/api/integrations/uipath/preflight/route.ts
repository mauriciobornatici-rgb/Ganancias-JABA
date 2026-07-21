export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUiPathIntegrationAuth } from '@/domain/ganancias/auth/integrationAuth';
import {
  prepareUiPathFiscalImport,
  readUiPathImportFiles,
} from '@/domain/ganancias/integrations/uipathFiscalImport';

export async function POST(request: NextRequest) {
  const authError = requireUiPathIntegrationAuth(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const cuit = String(formData.get('cuit') ?? '');
    const period = String(formData.get('periodo') ?? '');
    const files = await readUiPathImportFiles(formData);
    const prepared = await prepareUiPathFiscalImport({ ownerCuit: cuit, period, files });

    return NextResponse.json({
      success: true,
      data: {
        canImport: prepared.canImport,
        idempotencyKey: prepared.idempotencyKey,
        client: prepared.client,
        period: { year: prepared.year, month: prepared.month, id: prepared.fiscalPeriodId },
        periodWillBeCreated: prepared.periodWillBeCreated,
        files: prepared.manifest,
        totalDocuments: prepared.documents.length,
        totalAmount: prepared.totalAmount,
        inserted: prepared.inserted,
        duplicates: prepared.duplicates,
        conflicts: prepared.conflictKeys.length,
        conflictKeys: prepared.conflictKeys,
        errors: prepared.errors,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
