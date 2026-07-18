import { describe, expect, it } from 'vitest';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';

describe('buildTaxReturnCalculationInput', () => {
  it('excluye del cálculo las ventas marcadas No Computable (criterio 2026-07-16)', () => {
    const input = buildTaxReturnCalculationInput(
      {
        fiscalYear: 2025,
        sales: [
          { date: '2025-03-10', netAmount: '1000', isExempt: false },                        // sin flag -> computa
          { date: '2025-04-10', netAmount: '2000', isExempt: false, isComputable: true },    // computa
          { date: '2025-05-10', netAmount: '5000', isExempt: false, isComputable: false },   // excluida
          { date: '2025-06-10', netAmount: '300', isExempt: true, isComputable: false },     // excluida (ni exenta)
        ],
      },
      {},
    );

    expect(input.sales).toHaveLength(2);
    const amounts = input.sales.map(sale => sale.netAmount.toString());
    expect(amounts).toEqual(['1000', '2000']);
  });

  it('preserva campos guardados que impactan papel de trabajo y JVP', () => {
    const input = buildTaxReturnCalculationInput(
      {
        clientName: 'Cliente Prueba',
        cuit: '20-00000000-0',
        fiscalYear: 2025,
        initialStock: '1000',
        finalStock: '1500',
        generalDeductions: {
          deduccionLocadorLocatario: '1000000',
        },
        personalDeductions: {
          tipoDeduccionEspecial: 'Autonomo',
        },
        cashHoldings: [
          {
            currency: 'USD',
            nominalInitial: '100',
            nominalFinal: '150',
            tcFinal: '1446',
          },
        ],
        receivables: [
          {
            description: 'IVA saldo tecnico',
            type: 'Fiscal',
            balanceInitial: '10000',
            balanceFinal: '25000',
          },
        ],
        liabilities: [
          {
            description: 'Proveedor local',
            type: 'Proveedores',
            balanceInitial: '30000',
            balanceFinal: '12000',
          },
        ],
        personalLiabilities: [
          {
            description: 'Prestamo familiar',
            valueInitial: '250000',
            valueFinal: '100000',
          },
        ],
        otherJustifications: [
          {
            concept: 'Herencia recibida',
            column: '2',
            amount: '750000',
          },
        ],
        axiDynamic: [
          {
            concept: 'Retiro socio marzo',
            type: 'RetiroSocio',
            amount: '50000',
            date: '2025-03-15',
          },
        ],
      },
      {
        minimoNoImponible: '1',
        conyuge: '2',
        hijo: '3',
        hijoIncapacitado: '4',
        especialAutonomo: '5',
        especialEmprendedor: '6',
        especialDependiente: '7',
        topeServicioDomestico: '8',
        topeSeguroVida: '9',
        topeSeguroRetiro: '10',
        topeGastosSepelio: '11',
        topeInteresHipoteca: '12',
        topeGastosEducativos: '13',
        brackets: [
          {
            fromAmount: '0',
            toAmount: null,
            fixedAmount: '0',
            percentage: '0.35',
            excessOf: '0',
          },
        ],
        ipcIndices: [
          {
            monthIndex: 3,
            ipcValue: '120',
          },
        ],
      }
    );

    expect(input.generalDeductions[0].deduccionLocadorLocatario?.toNumber()).toBe(1_000_000);
    expect(input.cashHoldings[0].currency).toBe('USD');
    expect(input.cashHoldings[0].nominalFinal.toNumber()).toBe(150);
    expect(input.cashHoldings[0].tcFinal.toNumber()).toBe(1446);
    expect(input.receivables[0].type).toBe('Fiscal');
    expect(input.receivables[0].balanceFinal.toNumber()).toBe(25_000);
    expect(input.liabilities[0].type).toBe('Proveedores');
    expect(input.liabilities[0].balanceInitial.toNumber()).toBe(30_000);
    expect(input.personalLiabilities[0].valueInitial.toNumber()).toBe(250_000);
    expect(input.personalLiabilities[0].valueFinal.toNumber()).toBe(100_000);
    expect(input.otherJustifications[0].concept).toBe('Herencia recibida');
    expect(input.otherJustifications[0].column).toBe(2);
    expect(input.otherJustifications[0].amount.toNumber()).toBe(750_000);
    expect(input.axiDynamic[0].amount.toNumber()).toBe(50_000);
    expect(input.axiDynamic[0].date.toISOString().startsWith('2025-03-15')).toBe(true);
    expect(input.params.escalaArt94[0].percentage.toNumber()).toBe(0.35);
    expect(input.params.indicesIPC[0].ipcValue.toNumber()).toBe(120);
  });

  it('acepta la forma activa del wizard con parameterSet e indices', () => {
    const input = buildTaxReturnCalculationInput(
      {
        clientName: 'Cliente Wizard',
        cuit: '20-11111111-1',
        fiscalYear: 2025,
      },
      {
        parameterSet: {
          minimoNoImponible: '100',
          conyuge: '200',
          hijo: '300',
          hijoIncapacitado: '400',
          especialAutonomo: '500',
          especialEmprendedor: '600',
          especialDependiente: '700',
          topeServicioDomestico: '800',
          topeSeguroVida: '900',
          topeSeguroRetiro: '1000',
          topeGastosSepelio: '1100',
          topeInteresHipoteca: '1200',
          topeGastosEducativos: '1300',
        },
        brackets: [
          {
            fromAmount: '1000',
            toAmount: '2000',
            fixedAmount: '150',
            percentage: '0.09',
            excessOf: '1000',
          },
        ],
        indices: [
          {
            monthIndex: 12,
            ipcValue: '315',
          },
        ],
      }
    );

    expect(input.params.deduccionesArt30.minimoNoImponible.toNumber()).toBe(100);
    expect(input.params.topesDeduccionesGenerales.topeServicioDomestico.toNumber()).toBe(800);
    expect(input.params.escalaArt94[0].percentage.toNumber()).toBe(0.09);
    expect(input.params.indicesIPC[0].monthIndex).toBe(12);
    expect(input.params.indicesIPC[0].ipcValue.toNumber()).toBe(315);
  });

  it('preserva coeficientes utiles de indices para el calculo AXI', () => {
    const input = buildTaxReturnCalculationInput(
      {
        clientName: 'Cliente AXI',
        cuit: '20-33333333-3',
        fiscalYear: 2025,
      },
      {
        parameterSet: {
          minimoNoImponible: '0',
          conyuge: '0',
          hijo: '0',
          hijoIncapacitado: '0',
          especialAutonomo: '0',
          especialEmprendedor: '0',
          especialDependiente: '0',
          topeServicioDomestico: '0',
          topeSeguroVida: '0',
          topeSeguroRetiro: '0',
          topeGastosSepelio: '0',
          topeInteresHipoteca: '0',
          topeGastosEducativos: '0',
        },
        brackets: [],
        indices: [],
        usefulCoefficients: {
          decPreviousToDecCurrent: '1.3154876051264572',
          currentYearAverage: '1.1288404539857682',
        },
      }
    );

    const paramsWithUsefulCoefficients = input.params as typeof input.params & {
      usefulCoefficients?: {
        decPreviousToDecCurrent?: { toNumber: () => number };
        currentYearAverage?: { toNumber: () => number };
      };
    };

    expect(paramsWithUsefulCoefficients.usefulCoefficients?.decPreviousToDecCurrent?.toNumber()).toBeCloseTo(1.3154876051264572, 10);
    expect(paramsWithUsefulCoefficients.usefulCoefficients?.currentYearAverage?.toNumber()).toBeCloseTo(1.1288404539857682, 10);
  });

  it('acepta valores decimales tipo Prisma que exponen toString', () => {
    const decimalLike = { toString: () => '1234.56' };
    const input = buildTaxReturnCalculationInput(
      {
        clientName: 'Cliente API',
        cuit: '20-22222222-2',
        fiscalYear: 2025,
      },
      {
        parameterSet: {
          minimoNoImponible: decimalLike,
          conyuge: 0,
          hijo: 0,
          hijoIncapacitado: 0,
          especialAutonomo: 0,
          especialEmprendedor: 0,
          especialDependiente: 0,
          topeServicioDomestico: decimalLike,
          topeSeguroVida: 0,
          topeSeguroRetiro: 0,
          topeGastosSepelio: 0,
          topeInteresHipoteca: 0,
          topeGastosEducativos: 0,
        },
        brackets: [],
        indices: [],
      }
    );

    expect(input.params.deduccionesArt30.minimoNoImponible.toNumber()).toBe(1234.56);
    expect(input.params.topesDeduccionesGenerales.topeServicioDomestico.toNumber()).toBe(1234.56);
  });
});
