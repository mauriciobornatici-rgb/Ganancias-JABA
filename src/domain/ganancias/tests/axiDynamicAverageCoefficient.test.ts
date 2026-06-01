import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateAxiDynamic } from '../calculations/ajustePorInflacion';

const indicesIPC = [
  { monthIndex: 1, ipcValue: new Decimal(7864.1257) },
  { monthIndex: 12, ipcValue: new Decimal(10121.3715) },
];

describe('AXI dynamic average coefficient', () => {
  it('usa coeficiente promedio anual para retiros de socios agregados como la planilla AXI', () => {
    const result = calculateAxiDynamic(
      [
        {
          concept: 'Retiros de los socios',
          type: 'RetiroSocio',
          amount: new Decimal(3_901_371.69),
          date: new Date('2025-12-31'),
        },
      ],
      indicesIPC,
      {
        currentYearAverage: new Decimal(1.1288404539857682),
      }
    );

    expect(result.lines[0].factorActualizacion.toNumber()).toBeCloseTo(1.1288404539857682, 10);
    expect(result.lines[0].computedAxi.toNumber()).toBe(502654);
    expect(result.totalDynamic.toNumber()).toBe(502654);
  });

  it('mantiene coeficiente mensual para movimientos no agregados', () => {
    const result = calculateAxiDynamic(
      [
        {
          concept: 'Compra de bien amortizable agosto',
          type: 'Otro',
          amount: new Decimal(100_000),
          date: new Date('2025-01-15'),
        },
      ],
      indicesIPC,
      {
        currentYearAverage: new Decimal(1.1288404539857682),
      }
    );

    expect(result.lines[0].factorActualizacion.toNumber()).toBeCloseTo(10121.3715 / 7864.1257, 10);
    expect(result.lines[0].computedAxi.toNumber()).toBe(28703);
  });
});
