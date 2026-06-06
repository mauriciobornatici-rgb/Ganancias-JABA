import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { calculateClosingCommercialPatrimony } from '../calculations/patrimonioComercial';

describe('patrimonio comercial de cierre', () => {
  it('suma rubros comerciales de cierre y excluye bienes de uso dados de baja', () => {
    const result = calculateClosingCommercialPatrimony({
      bankAccounts: [{
        id: 'Banco',
        nominalInitial: new Decimal(0),
        nominalFinal: new Decimal(100),
        tcInitial: new Decimal(1),
        tcFinal: new Decimal(1),
        interests: new Decimal(0),
      }],
      cashHoldings: [],
      receivables: [{ description: 'Clientes', type: 'Comercial', balanceInitial: new Decimal(0), balanceFinal: new Decimal(200) }],
      inventories: [{ concept: 'Stock', initialStock: new Decimal(0), finalStock: new Decimal(300) }],
      fixedAssets: [
        {
          id: 'active',
          name: 'Maquina activa',
          type: 'Equipamiento',
          purchaseDate: new Date('2024-01-01'),
          originalCost: new Decimal(400),
          usefulLife: 5,
          yearsElapsed: 1,
          customReexpIndex: new Decimal(1),
        },
        {
          id: 'retired',
          name: 'Maquina baja',
          type: 'Equipamiento',
          purchaseDate: new Date('2023-01-01'),
          originalCost: new Decimal(999),
          usefulLife: 10,
          yearsElapsed: 3,
          customReexpIndex: new Decimal(1),
          isRetired: true,
        },
      ],
      liabilities: [{ description: 'Proveedor', type: 'Proveedores', balanceInitial: new Decimal(0), balanceFinal: new Decimal(150) }],
    });

    expect(result.hasClosingCommercialData).toBe(true);
    expect(result.totalAssets.toNumber()).toBe(1000);
    expect(result.totalLiabilities.toNumber()).toBe(150);
    expect(result.patrimonioComercialCierre.toNumber()).toBe(850);
  });

  it('no interpreta la fila automatica de inventario en cero como detalle cargado', () => {
    const result = calculateClosingCommercialPatrimony({
      bankAccounts: [],
      cashHoldings: [],
      receivables: [],
      inventories: [{ concept: 'Bienes de Cambio', initialStock: new Decimal(0), finalStock: new Decimal(0) }],
      fixedAssets: [],
      liabilities: [],
    });

    expect(result.hasClosingCommercialData).toBe(false);
    expect(result.patrimonioComercialCierre.toNumber()).toBe(0);
  });
});
