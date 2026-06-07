import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { buildWizardLoadReport } from '../presentation/wizardLoadReport';

describe('wizardLoadReport', () => {
  it('arma un legajo profesional con secciones, totales y controles de carga', () => {
    const report = buildWizardLoadReport({
      clientName: 'Cliente Demo',
      cuit: '20-12345678-9',
      fiscalYear: 2025,
      status: 'Borrador',
      emittedAt: new Date('2026-06-06T12:30:00-03:00'),
      currentStep: 6,
      sales: [
        { date: '2025-01-15', netAmount: '1000', isExempt: false, invoiceNumber: '0001-00000001' },
        { date: '2025-02-15', netAmount: '500', isExempt: true, invoiceNumber: '0001-00000002' },
      ],
      purchases: [
        { date: '2025-03-10', netAmount: '300', isDeductible: true, expenseType: 'MateriaPrima' },
        { date: '2025-04-10', netAmount: '50', isDeductible: false, expenseType: 'GastosGenerales' },
      ],
      initialStock: '100',
      finalStock: '200',
      fixedAssets: [
        { name: 'Notebook', originalCost: '250', usefulLife: '5', purchaseDate: '2024-05-10' },
      ],
      bankAccounts: [
        { name: 'Banco Demo', nominalInitial: '10', nominalFinal: '20', tcInitial: '1', tcFinal: '1' },
      ],
      cashHoldings: [
        { currency: 'USD', nominalInitial: '1', nominalFinal: '2', tcFinal: '1000' },
      ],
      receivables: [
        { description: 'Clientes', balanceInitial: '30', balanceFinal: '40' },
      ],
      liabilities: [
        { description: 'Proveedor', balanceInitial: '15', balanceFinal: '25' },
      ],
      withholdings: [
        { amount: '75', taxCode: 'Ganancias', certificateNumber: 'RET-1' },
      ],
      generalDeductions: {
        autonomos: '10',
        servicioDomestico: '20',
        seguroVida: '0',
        seguroRetiro: '0',
        gastosSepelio: '0',
        interesesHipoteca: '0',
        gastosEducativos: '5',
        alquilerCasaHabitacion: '0',
        deduccionLocadorLocatario: '0',
        donaciones: '0',
        medicosAsistencial: '0',
        honorariosMedicos: '0',
      },
      personalDeductions: {
        tieneConyuge: true,
        cantidadHijos: 1,
        cantidadHijosIncapacitados: 0,
        tipoDeduccionEspecial: 'Autonomo',
        esJubiladoOchoHaberes: false,
      },
      personalAssets: [
        { description: 'Deposito bancario', valueInitial: '100', valueFinal: '150' },
      ],
      personalLiabilities: [
        { description: 'Deuda personal', valueInitial: '20', valueFinal: '10' },
      ],
      otherJustifications: [
        { concept: 'Herencia', column: 2, amount: '500' },
      ],
      activoTotalInicio: '1000',
      pasivoTotalInicio: '400',
      bienesNoComputablesInicio: '50',
      saldoAFavorAnterior: '25',
      quebrantosAnteriores: '0',
      axiDynamic: [
        { concept: 'Retiro titular', type: 'RetiroSocio', amount: '100', date: '2025-03-15' },
      ],
      axiStaticBreakdown: {
        activo: {
          disponibilidadesBancos: { total: '10', computable: '10' },
        },
        pasivo: {
          deudasComerciales: { total: '15', computable: '15' },
        },
      },
      calculationResult: {
        resultadoComercialNeto: new Decimal('900'),
        resultadoImpositivoNeto: new Decimal('800'),
        impuestoDeterminado: new Decimal('120'),
        impuestoAPagarOARCA: new Decimal('45'),
        jvpJustificationDiff: new Decimal('0'),
      },
    });

    expect(report.metadata.title).toBe('Legajo de Carga - Ganancias Personas Humanas');
    expect(report.metadata.clientName).toBe('Cliente Demo');
    expect(report.metadata.fiscalYear).toBe('2025');
    expect(report.metrics.find(metric => metric.label === 'Ventas cargadas')?.value).toBe('2');
    expect(report.metrics.find(metric => metric.label === 'Compras cargadas')?.value).toBe('2');
    expect(report.metrics.find(metric => metric.label === 'Resultado impositivo neto')?.value).toBe('$ 800,00');
    expect(report.sections.map(section => section.title)).toEqual([
      'Paso 1 - Contribuyente y saldos iniciales',
      'Paso 2 - Ingresos y ventas',
      'Paso 3 - Gastos, compras y existencias',
      'Paso 4 - Patrimonio, bancos y bienes',
      'Paso 5 - Deducciones, retenciones, JVP y AXI',
      'Paso 6 - Liquidacion y controles',
    ]);
    expect(report.sections[1].rows.find(row => row.label === 'Ventas gravadas')?.value).toBe('$ 1.000,00');
    expect(report.sections[2].rows.find(row => row.label === 'Compras deducibles')?.value).toBe('$ 300,00');
    expect(report.sections[4].rows.find(row => row.label === 'Retenciones cargadas')?.value).toBe('$ 75,00');
    expect(report.validationNotices).toContain('Legajo generado con datos en memoria del wizard; guardar la DDJJ para conservar la carga en base de datos.');
  });
});
