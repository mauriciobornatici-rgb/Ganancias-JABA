import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import type { Prisma } from '@/generated/client/client';
import { Decimal } from 'decimal.js';
import * as xlsx from 'xlsx';
import { parseTaxParameterWorkbook } from '@/domain/ganancias/mappers/parameterImporter';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const yearStr = formData.get('year') as string | null;
    const resolutionName = formData.get('resolutionName') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No se ha subido ningún archivo Excel.' }, { status: 400 });
    }
    if (!yearStr) {
      return NextResponse.json({ success: false, error: 'El año fiscal es requerido.' }, { status: 400 });
    }
    if (!resolutionName || resolutionName.trim() === '') {
      return NextResponse.json({ success: false, error: 'El nombre de la resolución o norma es requerido.' }, { status: 400 });
    }

    const year = parseInt(yearStr, 10);
    if (isNaN(year)) {
      return NextResponse.json({ success: false, error: 'El año fiscal provisto es inválido.' }, { status: 400 });
    }

    // 1. Cargar el archivo en un Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Leer el libro Excel usando xlsx
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json({ success: false, error: 'El archivo Excel no posee hojas válidas.' }, { status: 400 });
    }

    const parsedWorkbook = parseTaxParameterWorkbook(workbook, year);
    const finalDeds = parsedWorkbook.deductions;
    const parsedBrackets = parsedWorkbook.brackets;
    const parsedIpc = parsedWorkbook.ipc;
    // 6. Transaccionar inserción en Base de Datos de forma segura
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 6.1 Crear o buscar FiscalYear
      let fiscalYear = await tx.fiscalYear.findUnique({
        where: { year }
      });
      if (!fiscalYear) {
        fiscalYear = await tx.fiscalYear.create({
          data: { year, isEnabled: true }
        });
      }

      // 6.2 Obtener versión incremental
      const existingSets = await tx.taxParameterSet.findMany({
        where: { fiscalYearId: fiscalYear.id },
        orderBy: { version: 'desc' }
      });
      const nextVersion = existingSets.length > 0 ? existingSets[0].version + 1 : 1;

      // 6.3 Crear TaxParameterSet (Resolución)
      const parameterSet = await tx.taxParameterSet.create({
        data: {
          fiscalYearId: fiscalYear.id,
          version: nextVersion,
          sourceLaw: resolutionName,
          status: 'validado',
          minimoNoImponible: new Decimal(finalDeds.minimoNoImponible),
          conyuge: new Decimal(finalDeds.conyuge),
          hijo: new Decimal(finalDeds.hijo),
          hijoIncapacitado: new Decimal(finalDeds.hijoIncapacitado),
          especialAutonomo: new Decimal(finalDeds.especialAutonomo),
          especialEmprendedor: new Decimal(finalDeds.especialEmprendedor),
          especialDependiente: new Decimal(finalDeds.especialDependiente),
          topeServicioDomestico: new Decimal(finalDeds.topeServicioDomestico),
          topeSeguroVida: new Decimal(finalDeds.topeSeguroVida),
          topeSeguroRetiro: new Decimal(finalDeds.topeSeguroRetiro),
          topeGastosSepelio: new Decimal(finalDeds.topeGastosSepelio),
          topeInteresHipoteca: new Decimal(finalDeds.topeInteresHipoteca),
          topeGastosEducativos: new Decimal(finalDeds.topeGastosEducativos)
        }
      });

      // 6.4 Insertar brackets de escala Artículo 94 específicos de la resolución
      if (parsedBrackets.length > 0) {
        for (const b of parsedBrackets) {
          await tx.taxArt94Bracket.create({
            data: {
              fiscalYearId: fiscalYear.id,
              taxParameterSetId: parameterSet.id,
              fromAmount: new Decimal(b.fromAmount),
              toAmount: b.toAmount ? new Decimal(b.toAmount) : null,
              fixedAmount: new Decimal(b.fixedAmount),
              percentage: new Decimal(b.percentage),
              excessOf: new Decimal(b.excessOf)
            }
          });
        }
      }

      // 6.5 Insertar / Upsert índices IPC si fueron proveídos en el Excel
      if (parsedIpc.length > 0) {
        for (const i of parsedIpc) {
          await tx.updateIndex.upsert({
            where: {
              fiscalYearId_monthIndex: {
                fiscalYearId: fiscalYear.id,
                monthIndex: i.monthIndex
              }
            },
            update: {
              ipcValue: new Decimal(i.ipcValue)
            },
            create: {
              fiscalYearId: fiscalYear.id,
              monthIndex: i.monthIndex,
              monthName: i.monthName,
              ipcValue: new Decimal(i.ipcValue)
            }
          });
        }
      }

      return {
        parameterSet,
        bracketsCount: parsedBrackets.length,
        ipcCount: parsedIpc.length
      };
    });

    return NextResponse.json({
      success: true,
      message: `¡Normativa e importes de resolución "${resolutionName}" cargados con éxito para el año fiscal ${year}!`,
      data: {
        id: result.parameterSet.id,
        year: year,
        version: result.parameterSet.version,
        resolution: result.parameterSet.sourceLaw,
        bracketsLoaded: result.bracketsCount,
        ipcLoaded: result.ipcCount,
        warnings: parsedWorkbook.warnings,
        usefulCoefficients: parsedWorkbook.usefulCoefficients
      }
    });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
    console.error("Error importing impositive parameters:", err);
    return NextResponse.json({
      success: false,
      error: `Error al procesar e importar archivo Excel: ${errorMessage}`
    }, { status: 500 });
  }
}




