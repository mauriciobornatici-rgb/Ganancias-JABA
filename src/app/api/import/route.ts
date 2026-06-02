import { NextRequest, NextResponse } from 'next/server';
import {
  parseAfipExportFiles,
  type AfipExpectedFileType,
} from '@/domain/ganancias/mappers/afipImporter';

function expectedFileTypeFromImportKind(value: FormDataEntryValue | null): AfipExpectedFileType | undefined {
  if (value === 'sales') return 'LibroIVAVentas';
  if (value === 'purchases') return 'LibroIVACompras';
  if (value === 'withholdings') return 'MisRetenciones';
  return undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData
      .getAll('files')
      .filter((value): value is File => value instanceof File);
    const legacyFile = formData.get('file');
    if (legacyFile instanceof File) {
      files.push(legacyFile);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se ha subido ningun archivo.' },
        { status: 400 }
      );
    }

    const expectedFileType = expectedFileTypeFromImportKind(formData.get('expectedType'));
    const fileInputs = await Promise.all(files.map(async file => ({
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
    })));

    const summary = parseAfipExportFiles(fileInputs, { expectedFileType });
    const hasRejectedFiles = summary.fileResults.some(result => !result.accepted);

    if (summary.fileType === 'Desconocido' || hasRejectedFiles || summary.totalRecords === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Uno o mas archivos AFIP no pudieron compilarse para esta carga.',
          details: summary.errors,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      fileType: summary.fileType,
      fileName: files.length === 1 ? files[0].name : `${files.length} archivos`,
      totalFiles: summary.totalFiles,
      fileResults: summary.fileResults,
      totalRecords: summary.totalRecords,
      totalAmount: summary.totalAmount,
      errors: summary.errors,
      data: {
        withholdings: summary.withholdings || null,
        sales: summary.sales || null,
        purchases: summary.purchases || null,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error interno al procesar el archivo: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}
