import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { TaxReturnCalculationInput } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

function createBaseInput(): TaxReturnCalculationInput {
  return {
    clientName: 'Caso Deducciones',
    cuit: '20-00000000-0',
    fiscalYear: 2025,
    params: {
      year: 2025,
      deduccionesArt30: {
        minimoNoImponible: new Decimal(0),
        conyuge: new Decimal(0),
        hijo: new Decimal(0),
        hijoIncapacitado: new Decimal(0),
        especialAutonomo: new Decimal(0),
        especialEmprendedor: new Decimal(0),
        especialDependiente: new Decimal(0),
      },
      topesDeduccionesGenerales: {
        topeServicioDomestico: new Decimal(0),
        topeSeguroVida: new Decimal(0),
        topeSeguroRetiro: new Decimal(0),
        topeGastosSepelio: new Decimal(0),
        topeInteresHipoteca: new Decimal(0),
        topeGastosEducativos: new Decimal(0),
      },
      escalaArt94: [],
      indicesIPC: [
        { monthIndex: 1, ipcValue: new Decimal(100) },
        { monthIndex: 12, ipcValue: new Decimal(100) },
      ],
    },
    sales: [{ date: new Date('2025-01-01'), netAmount: new Decimal(10_000_000), isExempt: false }],
    purchases: [],
    fixedAssets: [],
    inventories: [],
    bankAccounts: [],
    cashHoldings: [],
    receivables: [],
    liabilities: [],
    withholdings: [],
    generalDeductions: [
      {
        autonomos: new Decimal(0),
        servicioDomestico: new Decimal(0),
        seguroVida: new Decimal(0),
        seguroRetiro: new Decimal(0),
        gastosSepelio: new Decimal(0),
        interesesHipoteca: new Decimal(0),
        gastosEducativos: new Decimal(0),
        alquilerCasaHabitacion: new Decimal(0),
        deduccionLocadorLocatario: new Decimal(1_000_000),
        donaciones: new Decimal(0),
        medicosAsistencial: new Decimal(0),
        honorariosMedicos: new Decimal(0),
      },
    ],
    personalDeductions: {
      tieneConyuge: false,
      cantidadHijos: 0,
      cantidadHijosIncapacitados: 0,
      tipoDeduccionEspecial: 'Ninguna',
    },
    personalAssets: [],
    personalLiabilities: [],
    otherJustifications: [],
    axiStatic: {
      activoTotalInicio: new Decimal(0),
      bienesNoComputablesInicio: new Decimal(0),
      pasivoTotalInicio: new Decimal(0),
    },
    axiDynamic: [],
  };
}

describe('JABA Deducciones Generales', () => {
  it('aplica la nueva deduccion locador/locatario al 10% como IG 25!D28', () => {
    const result = calculateTaxReturn(createBaseInput());

    expect(result.deduccionesGenerales.locadorLocatarioTope.toNumber()).toBe(100_000);
    expect(result.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber()).toBe(100_000);
  });

  it('aplica topes encadenados de prepagas, honorarios medicos y donaciones como IG 25', () => {
    const input = createBaseInput();

    input.sales = [{ date: new Date('2025-01-01'), netAmount: new Decimal(1_000_000), isExempt: false }];
    input.params.topesDeduccionesGenerales = {
      topeServicioDomestico: new Decimal(1_000_000),
      topeSeguroVida: new Decimal(1_000_000),
      topeSeguroRetiro: new Decimal(1_000_000),
      topeGastosSepelio: new Decimal(1_000_000),
      topeInteresHipoteca: new Decimal(1_000_000),
      topeGastosEducativos: new Decimal(1_000_000),
    };
    input.generalDeductions[0] = {
      autonomos: new Decimal(100_000),
      servicioDomestico: new Decimal(100_000),
      seguroVida: new Decimal(100_000),
      seguroRetiro: new Decimal(100_000),
      gastosSepelio: new Decimal(0),
      interesesHipoteca: new Decimal(0),
      gastosEducativos: new Decimal(0),
      alquilerCasaHabitacion: new Decimal(0),
      deduccionLocadorLocatario: new Decimal(1_000_000),
      donaciones: new Decimal(1_000_000),
      medicosAsistencial: new Decimal(1_000_000),
      honorariosMedicos: new Decimal(1_000_000),
    };

    const result = calculateTaxReturn(input);

    expect(result.deduccionesGenerales.autonomosAdmitidos.toNumber()).toBe(100_000);
    expect(result.deduccionesGenerales.medicosAsistencialTope.toNumber()).toBe(30_000);
    expect(result.deduccionesGenerales.honorariosMedicosTope.toNumber()).toBe(25_000);
    expect(result.deduccionesGenerales.donacionesTope.toNumber()).toBe(30_000);
    expect(result.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber()).toBe(585_000);
  });

  it('expone excedentes no admitidos como importe JVP de columna I segun IG 25!E32', () => {
    const input = createBaseInput();
    input.sales = [{ date: new Date('2025-01-01'), netAmount: new Decimal(1_000_000), isExempt: false }];
    input.params.topesDeduccionesGenerales.topeServicioDomestico = new Decimal(100_000);
    input.generalDeductions[0] = {
      autonomos: new Decimal(0),
      servicioDomestico: new Decimal(250_000),
      seguroVida: new Decimal(0),
      seguroRetiro: new Decimal(0),
      gastosSepelio: new Decimal(0),
      interesesHipoteca: new Decimal(0),
      gastosEducativos: new Decimal(0),
      alquilerCasaHabitacion: new Decimal(0),
      deduccionLocadorLocatario: new Decimal(0),
      donaciones: new Decimal(0),
      medicosAsistencial: new Decimal(0),
      honorariosMedicos: new Decimal(0),
    };

    const result = calculateTaxReturn(input);

    expect(result.deduccionesGenerales.totalExcedenteDeduccionesGeneralesJvp.toNumber()).toBe(150_000);
    expect(result.gastosNoDeducibles.toNumber()).toBe(0);
    expect(result.jvpTotalColumnaI.toNumber()).toBe(900_000);
    expect(result.jvpTotalColumnaII.toNumber()).toBe(900_000);
    expect(result.consumoDiferencial.toNumber()).toBe(-250_000);
  });
});
