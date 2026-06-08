import { describe, expect, it } from 'vitest';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
import {
  buildWizardAxiDynamicReconciliation,
  buildWizardEffectiveCalculationParams,
  normalizeWizardIpcValue,
} from '../presentation/wizardCalculationParams';

const fallbackParameterSet = {
  minimoNoImponible: 4507505.52,
  conyuge: 4245166.13,
  hijo: 2140852.77,
  hijoIncapacitado: 4281705.53,
  especialAutonomo: 15776269.32,
  especialEmprendedor: 18030022.08,
  especialDependiente: 21636026.50,
  topeServicioDomestico: 4507505.52,
  topeSeguroVida: 573817.13,
  topeSeguroRetiro: 573817.13,
  topeGastosSepelio: 996.23,
  topeInteresHipoteca: 20000,
  topeGastosEducativos: 1803002.21,
};

describe('wizardCalculationParams', () => {
  it('no deja deducciones en cero si hay indices activos pero falta parameterSet', () => {
    const params = buildWizardEffectiveCalculationParams({
      activeParams: {
        parameterSet: null,
        brackets: [],
        indices: [{ monthIndex: 1, ipcValue: '4261.5324' }],
      },
      fallbackParameterSet,
      fallbackBrackets: [],
      fiscalYear: 2024,
      localIpcValues: {
        '2023_12': '3533.19',
        '2024_1': '4261.5324',
        '2024_12': '7694.0075',
      },
    });

    const input = buildTaxReturnCalculationInput(
      { clientName: 'Cliente', cuit: '20-11111111-1', fiscalYear: 2024 },
      params,
    );

    expect(input.params.deduccionesArt30.minimoNoImponible.toNumber()).toBe(4507505.52);
    expect(input.params.indicesIPC.some(index => index.monthIndex === 1)).toBe(true);
    expect(input.params.indicesIPC.some(index => index.monthIndex === 12)).toBe(true);
    expect(input.params.usefulCoefficients?.decPreviousToDecCurrent?.toNumber()).toBeCloseTo(7694.0075 / 3533.19, 10);
  });

  it('prioriza indices visibles en pantalla sobre indices viejos de la API', () => {
    const params = buildWizardEffectiveCalculationParams({
      activeParams: {
        parameterSet: fallbackParameterSet,
        brackets: [],
        indices: [{ monthIndex: 12, ipcValue: '1' }],
      },
      fallbackParameterSet,
      fallbackBrackets: [],
      fiscalYear: 2024,
      localIpcValues: {
        '2023_12': '3533.19',
        '2024_1': '4261.5324',
        '2024_12': '7694.0075',
      },
    });

    expect(params.indices.find(index => Number(index.monthIndex) === 12)?.ipcValue).toBe('7694.0075');
  });

  it('normaliza coma decimal en indices cargados por pantalla', () => {
    expect(normalizeWizardIpcValue('4261,5324')).toBe('4261.5324');
    expect(normalizeWizardIpcValue('sin-dato')).toBe('0');
  });

  it('calcula retiro/aporte neto como capital teorico menos capital real con signo', () => {
    const reconciliation = buildWizardAxiDynamicReconciliation({
      theoreticalCapital: 5641175.87,
      realCapital: 7155722.45,
    });

    expect(reconciliation.signedDifference).toBe(-1514546.58);
    expect(reconciliation.label).toBe('Aporte');
    expect(reconciliation.movementType).toBe('AporteCapital');
    expect(reconciliation.absoluteAmount).toBe(1514546.58);
  });
});
