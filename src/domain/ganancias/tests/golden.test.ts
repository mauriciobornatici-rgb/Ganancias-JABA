import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { TaxReturnCalculationInput, Art94Bracket } from '../types';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';

describe('JABA Tax Calculation Motor - Golden Tests', () => {
  // Mock de la escala progresiva de Ganancias del Artículo 94 para el período fiscal 2025
  const escala2025Mock: Art94Bracket[] = [
    { fromAmount: new Decimal(0), toAmount: new Decimal(1749901.45), fixedAmount: new Decimal(0), percentage: new Decimal(0.05), excessOf: new Decimal(0) },
    { fromAmount: new Decimal(1749901.45), toAmount: new Decimal(3499802.89), fixedAmount: new Decimal(87495.07), percentage: new Decimal(0.09), excessOf: new Decimal(1749901.45) },
    { fromAmount: new Decimal(3499802.89), toAmount: new Decimal(5249704.34), fixedAmount: new Decimal(244986.20), percentage: new Decimal(0.12), excessOf: new Decimal(3499802.89) },
    { fromAmount: new Decimal(5249704.34), toAmount: new Decimal(7874556.52), fixedAmount: new Decimal(454974.38), percentage: new Decimal(0.15), excessOf: new Decimal(5249704.34) },
    { fromAmount: new Decimal(7874556.52), toAmount: new Decimal(15749113.04), fixedAmount: new Decimal(848702.20), percentage: new Decimal(0.19), excessOf: new Decimal(7874556.52) },
    { fromAmount: new Decimal(15749113.04), toAmount: new Decimal(23623669.56), fixedAmount: new Decimal(2344867.94), percentage: new Decimal(0.23), excessOf: new Decimal(15749113.04) },
    { fromAmount: new Decimal(23623669.56), toAmount: new Decimal(35435504.34), fixedAmount: new Decimal(4156015.94), percentage: new Decimal(0.27), excessOf: new Decimal(23623669.56) },
    { fromAmount: new Decimal(35435504.34), toAmount: new Decimal(53153256.52), fixedAmount: new Decimal(7345211.33), percentage: new Decimal(0.31), excessOf: new Decimal(35435504.34) },
    { fromAmount: new Decimal(53153256.52), toAmount: null, fixedAmount: new Decimal(12837714.51), percentage: new Decimal(0.35), excessOf: new Decimal(53153256.52) },
  ];

  it('Debe calcular correctamente una liquidación comercial estándar (Tercera Categoría) de 2025', () => {
    const input: TaxReturnCalculationInput = {
      clientName: 'Lobato Francisco',
      cuit: '20-34590216-4',
      fiscalYear: 2025,
      params: {
        year: 2025,
        deduccionesArt30: {
          minimoNoImponible: new Decimal(4507505.52),
          conyuge: new Decimal(4245166.13),
          hijo: new Decimal(2140852.77),
          hijoIncapacitado: new Decimal(4281705.53),
          especialAutonomo: new Decimal(15776269.32),
          especialEmprendedor: new Decimal(18030022.08),
          especialDependiente: new Decimal(21636026.50),
        },
        topesDeduccionesGenerales: {
          topeServicioDomestico: new Decimal(4507505.52),
          topeSeguroVida: new Decimal(573817.13),
          topeSeguroRetiro: new Decimal(573817.13),
          topeGastosSepelio: new Decimal(996.23),
          topeInteresHipoteca: new Decimal(20000.00),
          topeGastosEducativos: new Decimal(1803002.21),
        },
        escalaArt94: escala2025Mock,
        indicesIPC: [],
      },
      sales: [
        { date: new Date('2025-03-15'), netAmount: new Decimal(45000000), isExempt: false },
        { date: new Date('2025-06-20'), netAmount: new Decimal(1200000), isExempt: true }, // Ingreso exento
      ],
      purchases: [
        { date: new Date('2025-02-10'), netAmount: new Decimal(15000000), isDeductible: true, isExempt: false, expenseType: 'MateriaPrima' },
        { date: new Date('2025-05-12'), netAmount: new Decimal(2500000), isDeductible: true, isExempt: false, expenseType: 'GastosGenerales' },
        { date: new Date('2025-08-14'), netAmount: new Decimal(100000), isDeductible: false, isExempt: false, expenseType: 'GastosPersonales' },
      ],
      fixedAssets: [
        {
          id: 'asset-1',
          name: 'Automotor Comercial',
          type: 'Rodado',
          purchaseDate: new Date('2023-04-10'),
          originalCost: new Decimal(10000000),
          usefulLife: 5,
          yearsElapsed: 2, // 2 años transcurridos
          customReexpIndex: new Decimal(1.315488), // Coeficiente IPC 2025
        }
      ],
      inventories: [
        { concept: 'Mercadería de Reventa', initialStock: new Decimal(2000000), finalStock: new Decimal(3500000) }
      ],
      bankAccounts: [],
      cashHoldings: [],
      receivables: [],
      liabilities: [],
      withholdings: [
        { amount: new Decimal(450000), taxCode: 'Ganancias' }
      ],
      generalDeductions: [
        {
          autonomos: new Decimal(350000),
          servicioDomestico: new Decimal(5000000), // Excede el tope impositivo
          seguroVida: new Decimal(100000),
          seguroRetiro: new Decimal(0),
          gastosSepelio: new Decimal(0),
          interesesHipoteca: new Decimal(0),
          gastosEducativos: new Decimal(500000),
          alquilerCasaHabitacion: new Decimal(0),
          donaciones: new Decimal(0),
          medicosAsistencial: new Decimal(0),
          honorariosMedicos: new Decimal(0),
        }
      ],
      personalDeductions: {
        tieneConyuge: true,
        cantidadHijos: 1,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Autonomo',
      },
      personalAssets: [
        { description: 'Inmueble Personal', type: 'Inmueble', valueInitial: new Decimal(15000000), valueFinal: new Decimal(15000000) },
        { description: 'Saldo en Pesos', type: 'Efectivo', valueInitial: new Decimal(500000), valueFinal: new Decimal(2000000) }
      ],
      personalLiabilities: [],
      otherJustifications: [],
      // Ajuste por inflación impositivo (AXI)
      axiStatic: {
        activoTotalInicio: new Decimal(2290323),
        bienesNoComputablesInicio: new Decimal(442996.02), // Equivalente al valor roto de la celda F24
        pasivoTotalInicio: new Decimal(0),
      },
      axiDynamic: [
        // Retiro de socios con coeficiente IPC
        { concept: 'Retiro del Socio Lobato', type: 'RetiroSocio', amount: new Decimal(3901371.69), date: new Date('2025-12-31') }
      ],
    };

    const result = calculateTaxReturn(input);

    // 1. Verificación del cálculo del Costo de Ventas
    // Existencia Inicial (2.000.000) + Compras (15.000.000) - Existencia Final (3.500.000) = 13.500.000
    expect(result.costoVentas.toNumber()).toBe(13500000);

    // 2. Verificación de la Amortización del Bien de Uso
    // Costo Origen (10.000.000) / Vida Útil (5) = Amortización Histórica 2.000.000
    // Amortización Reexpresada = 2.000.000 * 1.315488 = 2.630.976
    expect(result.amortizacionesBienesDeUso.toNumber()).toBe(2630976);

    // 3. Verificación de Deducciones Generales Aplicadas con Topes
    // Autónomos (350.000) + Doméstico (Tope 4.507.505.52) + Vida (100.000) + Educativos (500.000) = 5.457.505.52
    expect(result.deduccionesGenerales.totalDeduccionesGeneralesAdmitidas.toNumber()).toBe(5457506);

    // 4. Verificación de Deducciones Personales Aplicadas
    // MNI (4.507.505.52) + Cónyuge (4.245.166.13) + 1 Hijo (2.140.852.77) + Especial Autónoma (15.776.269.32) = 26.669.793.74 (redondeado 26669794)
    expect(result.deduccionesPersonales.totalDeduccionesPersonalesAdmitidas.toNumber()).toBe(26669794);

    // 5. Verificación de la exactitud matemática general sin errores
    expect(result.errors.length).toBe(0);
    
    // El Consumo debe ser positivo
    expect(result.consumoDiferencial.gt(0)).toBe(true);
    console.log('Resulting Consumo Anual para Lobato:', result.consumoDiferencial.toString());
    console.log('Resulting Impuesto Determinado Art 94:', result.impuestoDeterminado.toString());
  });
});
