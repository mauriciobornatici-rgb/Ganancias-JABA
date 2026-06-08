import { describe, it, expect } from 'vitest';
import { calculateTaxReturn } from '../calculations/determinacionImpuesto';
import { buildExcelCaptureCaseFixture } from '../fixtures/excelCaptureCaseFixture';
import { buildTaxReturnCalculationInput } from '../mappers/calculationInputMapper';
import { buildTaxReturnPreview } from '../presentation/taxReturnPreview';

describe('Simulacion con capturas actuales del usuario', () => {
  it('replica CMV, resultado, patrimonio y JVP de las capturas del 06-06-2026', () => {
    const { declarationData, taxParameters, expected } = buildExcelCaptureCaseFixture();
    const input = buildTaxReturnCalculationInput(declarationData, taxParameters);

    const result = calculateTaxReturn(input);

    expect(result.ventasGravadas.toNumber()).toBe(expected.ventasGravadas);
    expect(result.costoVentas.toNumber()).toBe(expected.costoVentas);
    expect(result.gastosDeducibles.toNumber()).toBe(expected.gastosDeducibles);
    expect(result.amortizacionesBienesDeUso.toNumber()).toBe(expected.amortizacionesBienesDeUso);
    expect(result.resultadoAjustePorInflacion.toNumber()).toBe(expected.resultadoAjustePorInflacion);
    expect(result.resultadoComercialNeto.toNumber()).toBe(expected.resultadoComercialNeto);
    expect(result.resultadoImpositivoNeto.toNumber()).toBe(expected.resultadoImpositivoNeto);

    expect(result.patrimonioInicioTotal.toNumber()).toBe(expected.patrimonioInicioTotal);
    expect(result.patrimonioCierreTotal.toNumber()).toBe(expected.patrimonioCierreTotal);
    expect(result.consumoDiferencial.toNumber()).toBe(expected.consumoDiferencial);
    expect(result.jvpTotalColumnaI.toNumber()).toBe(expected.jvpTotalColumnaI);
    expect(result.jvpTotalColumnaII.toNumber()).toBe(expected.jvpTotalColumnaII);
    expect(result.jvpJustificationDiff.toNumber()).toBe(expected.jvpJustificationDiff);
  });

  it('replica las capturas cuando la carga llega como datos del wizard', () => {
    const { declarationData, taxParameters, expected } = buildExcelCaptureCaseFixture();
    const preview = buildTaxReturnPreview(declarationData, taxParameters);

    expect(preview.ventasGravadas).toBe(expected.ventasGravadas);
    expect(preview.costoVentas).toBe(expected.costoVentas);
    expect(preview.gastosDeducibles).toBe(expected.gastosDeducibles);
    expect(preview.resultadoAjustePorInflacion).toBe(expected.resultadoAjustePorInflacion);
    expect(preview.resultadoComercialNeto).toBe(expected.resultadoComercialNeto);
    expect(preview.resultadoImpositivoNeto).toBe(expected.resultadoImpositivoNeto);
    expect(preview.patrimonioInicioTotal).toBe(expected.patrimonioInicioTotal);
    expect(preview.patrimonioCierreTotal).toBe(expected.patrimonioCierreTotal);
    expect(preview.consumoDiferencial).toBe(expected.consumoDiferencial);
    expect(preview.jvpTotalColumnaI).toBe(expected.jvpTotalColumnaI);
    expect(preview.jvpTotalColumnaII).toBe(expected.jvpTotalColumnaII);
    expect(preview.jvpJustificationDiff).toBe(expected.jvpJustificationDiff);
  });
});
