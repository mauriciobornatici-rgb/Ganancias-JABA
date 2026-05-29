import { NextRequest, NextResponse } from 'next/server';
import { parseAfipExportFile } from '@/domain/ganancias/mappers/afipImporter';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se ha subido ningún archivo.' },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ejecutar el parser impositivo dinámico
    const summary = parseAfipExportFile(buffer, fileName);

    if (summary.fileType === 'Desconocido') {
      return NextResponse.json(
        {
          success: false,
          error: 'Formato de archivo AFIP no reconocido o vacío.',
          details: summary.errors
        },
        { status: 422 }
      );
    }

    // Retornar los datos parseados y normalizados para la previsualización interactiva en el Wizard
    return NextResponse.json({
      success: true,
      fileType: summary.fileType,
      fileName,
      totalRecords: summary.totalRecords,
      totalAmount: summary.totalAmount,
      errors: summary.errors,
      // Los registros se retornan listos para que el liquidador los revise, corrija o agregue nuevos en la UI
      data: {
        withholdings: summary.withholdings || null,
        sales: summary.sales || null,
        purchases: summary.purchases || null,
      }
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Error interno al procesar el archivo: ${err.message}` },
      { status: 500 }
    );
  }
}
