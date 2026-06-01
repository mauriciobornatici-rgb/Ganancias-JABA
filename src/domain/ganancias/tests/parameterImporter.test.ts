import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as xlsx from 'xlsx';
import { parseTaxParameterWorkbook } from '../mappers/parameterImporter';

function findReferenceWorkbook(prefix: string): string | null {
  const personaFisicaDir = path.resolve(process.cwd(), '..');
  if (!existsSync(personaFisicaDir)) return null;

  const fileName = readdirSync(personaFisicaDir).find((name) =>
    name.toLowerCase().startsWith(prefix.toLowerCase()) && name.toLowerCase().endsWith('.xlsx')
  );

  return fileName ? path.join(personaFisicaDir, fileName) : null;
}

describe('JABA Tax Parameter Workbook Importer', () => {
  const indicesWorkbookPath = findReferenceWorkbook('Indices de actualiz');
  const runIfWorkbookExists = indicesWorkbookPath ? it : it.skip;

  runIfWorkbookExists('normaliza fechas seriales de Excel a meses 1..12 para indices IPC 2025', () => {
    const workbook = xlsx.readFile(indicesWorkbookPath!, { cellDates: false });

    const parsed = parseTaxParameterWorkbook(workbook, 2025);

    expect(parsed.ipc).toHaveLength(12);
    expect(parsed.ipc.map((item) => item.monthIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(parsed.ipc.every((item) => item.monthIndex >= 1 && item.monthIndex <= 12)).toBe(true);
    expect(parsed.ipc.find((item) => item.monthIndex === 1)?.ipcValue).toBeCloseTo(7864.1257, 4);
    expect(parsed.ipc.find((item) => item.monthIndex === 12)?.ipcValue).toBeCloseTo(10121.3715, 4);
    expect(parsed.usefulCoefficients.decPreviousToDecCurrent).toBeCloseTo(1.3154876051, 10);
    expect(parsed.usefulCoefficients.currentYearAverage).toBeCloseTo(1.128840454, 9);
    const workbookWithPriorIndex = parsed as typeof parsed & {
      previousYearDecemberIndex?: {
        monthIndex: number;
        monthName: string;
        ipcValue: number;
        sourceYear?: number;
      };
    };

    expect(workbookWithPriorIndex.previousYearDecemberIndex).toMatchObject({
      monthIndex: 12,
      monthName: 'Diciembre',
      sourceYear: 2024,
    });
    expect(workbookWithPriorIndex.previousYearDecemberIndex?.ipcValue).toBeCloseTo(7694.0075, 4);
  });
});
