import { describe, expect, it } from 'vitest';
import { buildUsefulCoefficientsFromIndexes } from '../mappers/taxParameterUsefulCoefficients';

describe('buildUsefulCoefficientsFromIndexes', () => {
  it('deriva coeficientes utiles de diciembre anterior, meses actuales y diciembre actual', () => {
    const usefulCoefficients = buildUsefulCoefficientsFromIndexes(
      [
        { monthIndex: 1, ipcValue: '7864.1257' },
        { monthIndex: 2, ipcValue: '8052.9927' },
        { monthIndex: 3, ipcValue: '8353.3158' },
        { monthIndex: 4, ipcValue: '8585.6078' },
        { monthIndex: 5, ipcValue: '8714.4871' },
        { monthIndex: 6, ipcValue: '8855.5681' },
        { monthIndex: 7, ipcValue: '9023.973' },
        { monthIndex: 8, ipcValue: '9193.2441' },
        { monthIndex: 9, ipcValue: '9384.0922' },
        { monthIndex: 10, ipcValue: '9603.8623' },
        { monthIndex: 11, ipcValue: '9841.3581' },
        { monthIndex: 12, ipcValue: '10121.3715' },
      ],
      { monthIndex: 12, ipcValue: '7694.0075' }
    );

    expect(usefulCoefficients.decPreviousToDecCurrent?.toNumber()).toBeCloseTo(1.3154876051264572, 10);
    expect(usefulCoefficients.currentYearAverage?.toNumber()).toBeCloseTo(1.1288404539857682, 10);
  });
});
