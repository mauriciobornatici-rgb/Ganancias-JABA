import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as xlsx from 'xlsx';

function findReferenceWorkbook(prefix: string): string | null {
  const personaFisicaDir = path.resolve(process.cwd(), '..');
  if (!existsSync(personaFisicaDir)) return null;

  const fileName = readdirSync(personaFisicaDir).find((name) =>
    name.toLowerCase().startsWith(prefix.toLowerCase()) && name.toLowerCase().endsWith('.xlsx')
  );

  return fileName ? path.join(personaFisicaDir, fileName) : null;
}

describe('JABA Excel Oracle - DJ Ganancias 2025 Tercera Categoria', () => {
  const workbookPath = findReferenceWorkbook('DJ Ganancias 2025');
  const runIfWorkbookExists = workbookPath ? it : it.skip;

  runIfWorkbookExists('contiene las hojas base esperadas para la liquidacion', () => {
    const workbook = xlsx.readFile(workbookPath!, { cellFormula: true });

    expect(workbook.SheetNames).toEqual([
      'IG 25',
      'Anticipos',
      'Ded. Gen.',
      'Patrimonio personal',
      'Inmueble',
      'Rodado',
      'Cuenta Bancaria',
      'Pasivo Personal',
      'JVP',
      'ER',
      'ESP',
      'Ventas',
      'Compras',
      'Resumen compras y otros',
      'Bienes de Uso',
      'Bienes de Cambio',
      'Efectivo',
      'Banco',
      'Creditos',
      'Retenciones',
      'Pasivo',
    ]);
  });

  runIfWorkbookExists('mantiene formulas clave usadas como oraculo funcional', () => {
    const workbook = xlsx.readFile(workbookPath!, { cellFormula: true, cellText: false });

    const expectedFormulas: Record<string, Record<string, string>> = {
      'IG 25': {
        F17: 'SUM(C15:F15)',
        F32: 'SUM(F20:F31)',
        F34: '+F17-F32',
        F38: '+F34-F36',
        F58: '+IF(F38>F56,F38-F56,0)',
        F60: 'MAX(0,VLOOKUP(F58,$B$74:$F$82,3)+((F58-VLOOKUP(F58,$B$74:$F$82,5))*VLOOKUP(F58,$B$74:$F$82,4)))',
        C28: "+'Ded. Gen.'!F216",
        D28: '+C28*0.1',
        F28: 'IF(D28=0,0,IF(C28>D28,D28,C28))',
        D29: '+IF(($F$17-SUM($F$20:$F$28))*0.05<0,0,($F$17-SUM($F$20:$F$23))*0.05)',
        D30: '+IF((F17-SUM(F20:F28))*0.05<0,C30*0.4,MIN((F17-SUM(F20:F28))*0.05,C30*0.4))',
      },
      ER: {
        C68: 'SUM(C15:C16)+SUM(C28:C43)+SUM(C49:C66)',
      },
      JVP: {
        C17: 'SUM(C8:C16)',
        D17: 'SUM(D8:D15)',
        C19: '+ROUND(D17-C17,2)',
        C21: 'SUM(C17:C19)',
        D21: 'SUM(D17:D19)',
      },
      'Bienes de Uso': {
        F4: '$B$1-E4+1',
        J4: 'I4/G4',
        K4: 'J4*H4',
        L4: 'I4-(J4*F4)',
        M4: 'I4*H4-(K4*F4)',
      },
    };

    for (const [sheetName, formulas] of Object.entries(expectedFormulas)) {
      const sheet = workbook.Sheets[sheetName];
      expect(sheet, `No existe la hoja ${sheetName}`).toBeTruthy();

      for (const [cellRef, expectedFormula] of Object.entries(formulas)) {
        expect(sheet[cellRef]?.f, `${sheetName}!${cellRef}`).toBe(expectedFormula);
      }
    }
  });
});

