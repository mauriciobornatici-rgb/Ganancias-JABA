import { NextRequest, NextResponse } from 'next/server';
import { buildTaxReturnPreview } from '@/domain/ganancias/presentation/taxReturnPreview';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const declarationData = body.declarationData ?? body.declaration;
    const taxParameters = body.taxParameters;

    if (!declarationData || !taxParameters) {
      return NextResponse.json(
        { success: false, error: 'La vista previa requiere datos de declaracion y parametros impositivos.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: buildTaxReturnPreview(declarationData, taxParameters),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: `Error al calcular vista previa: ${message}` },
      { status: 500 }
    );
  }
}
