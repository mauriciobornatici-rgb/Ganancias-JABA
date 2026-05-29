import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { Decimal } from 'decimal.js';
import * as xlsx from 'xlsx';

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

    // 3. Procesar Hoja 1: Deducciones (Artículo 30)
    const dedSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('deduc')) || workbook.SheetNames[0];
    const dedSheet = workbook.Sheets[dedSheetName];
    const dedRows = xlsx.utils.sheet_to_json<any>(dedSheet);
    
    const deducciones: Record<string, number> = {};
    for (const row of dedRows) {
      const keys = Object.keys(row);
      if (keys.length < 2) continue;
      const keyVal = row[keys[0]];
      const rawVal = row[keys[1]];
      if (keyVal && rawVal !== undefined) {
        const cleanKey = String(keyVal).trim();
        const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
        if (!isNaN(numVal)) {
          deducciones[cleanKey] = numVal;
        }
      }
    }

    // Mapear con nombres de columnas de base de datos y proveer defaults si faltan
    const finalDeds = {
      minimoNoImponible: deducciones['minimoNoImponible'] ?? deducciones['Mínimo No Imponible'] ?? 4507505.52,
      conyuge: deducciones['conyuge'] ?? deducciones['Cónyuge'] ?? 4245166.13,
      hijo: deducciones['hijo'] ?? deducciones['Hijo'] ?? 2140852.77,
      hijoIncapacitado: deducciones['hijoIncapacitado'] ?? deducciones['Hijo Incapacitado'] ?? 4281705.53,
      especialAutonomo: deducciones['especialAutonomo'] ?? deducciones['Especial Autónomo'] ?? 15776269.32,
      especialEmprendedor: deducciones['especialEmprendedor'] ?? deducciones['Especial Emprendedor'] ?? 18030022.08,
      especialDependiente: deducciones['especialDependiente'] ?? deducciones['Especial Dependiente'] ?? 21636026.50,
      topeServicioDomestico: deducciones['topeServicioDomestico'] ?? deducciones['Servicio Doméstico'] ?? 4507505.52,
      topeSeguroVida: deducciones['topeSeguroVida'] ?? deducciones['Seguro de Vida'] ?? 573817.13,
      topeSeguroRetiro: deducciones['topeSeguroRetiro'] ?? deducciones['Seguro de Retiro'] ?? 573817.13,
      topeGastosSepelio: deducciones['topeGastosSepelio'] ?? deducciones['Gastos de Sepelio'] ?? 996.23,
      topeInteresHipoteca: deducciones['topeInteresHipoteca'] ?? deducciones['Intereses Hipoteca'] ?? 20000.00,
      topeGastosEducativos: deducciones['topeGastosEducativos'] ?? deducciones['Gastos Educativos'] ?? 1803002.21,
    };

    // 4. Procesar Hoja 2: Escalas (Artículo 94)
    const escSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('escal') || name.toLowerCase().includes('bracket')) || workbook.SheetNames[1];
    let parsedBrackets: any[] = [];
    if (escSheetName) {
      const escSheet = workbook.Sheets[escSheetName];
      const escRows = xlsx.utils.sheet_to_json<any>(escSheet);
      parsedBrackets = escRows.map((row: any) => {
        const keys = Object.keys(row);
        // Esperamos columnas en orden: Desde, Hasta, Fijo, Alícuota, Excedente
        const from = typeof row[keys[0]] === 'number' ? row[keys[0]] : parseFloat(String(row[keys[0]] || '0'));
        const to = row[keys[1]] === null || row[keys[1]] === undefined || String(row[keys[1]]).trim().toLowerCase() === 'y más' ? null : (typeof row[keys[1]] === 'number' ? row[keys[1]] : parseFloat(String(row[keys[1]])));
        const fixed = typeof row[keys[2]] === 'number' ? row[keys[2]] : parseFloat(String(row[keys[2]] || '0'));
        let pct = typeof row[keys[3]] === 'number' ? row[keys[3]] : parseFloat(String(row[keys[3]] || '0'));
        if (pct > 1) pct = pct / 100; // si vino 35% como 35 lo convertimos a 0.35
        const excess = typeof row[keys[4]] === 'number' ? row[keys[4]] : parseFloat(String(row[keys[4]] || '0'));

        return {
          fromAmount: isNaN(from) ? 0 : from,
          toAmount: isNaN(to as number) ? null : to,
          fixedAmount: isNaN(fixed) ? 0 : fixed,
          percentage: isNaN(pct) ? 0 : pct,
          excessOf: isNaN(excess) ? 0 : excess
        };
      });
    }

    // 5. Procesar Hoja 3: IPC (Opcional)
    const ipcSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('ipc') || name.toLowerCase().includes('indic')) || workbook.SheetNames[2];
    let parsedIpc: any[] = [];
    if (ipcSheetName) {
      const ipcSheet = workbook.Sheets[ipcSheetName];
      const ipcRows = xlsx.utils.sheet_to_json<any>(ipcSheet);
      parsedIpc = ipcRows.map((row: any) => {
        const keys = Object.keys(row);
        if (keys.length < 2) return null;
        const monthVal = parseInt(String(row[keys[0]]), 10);
        const ipcVal = typeof row[keys[1]] === 'number' ? row[keys[1]] : parseFloat(String(row[keys[1]] || '0'));
        
        if (isNaN(monthVal) || isNaN(ipcVal)) return null;
        const monthNames: Record<number, string> = {
          1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
          7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
        };
        return {
          monthIndex: monthVal,
          monthName: monthNames[monthVal] || `Mes ${monthVal}`,
          ipcValue: ipcVal
        };
      }).filter(Boolean);
    }

    // 6. Transaccionar inserción en Base de Datos de forma segura
    const result = await prisma.$transaction(async (tx: any) => {
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
        ipcLoaded: result.ipcCount
      }
    });

  } catch (err: any) {
    console.error("Error importing impositive parameters:", err);
    return NextResponse.json({
      success: false,
      error: `Error al procesar e importar archivo Excel: ${err.message}`
    }, { status: 500 });
  }
}
