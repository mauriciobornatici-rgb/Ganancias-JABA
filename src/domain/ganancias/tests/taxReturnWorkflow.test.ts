import { describe, expect, it } from 'vitest';
import {
  TAX_RETURN_STATUS,
  buildTaxReturnAnnulmentDecision,
  buildTaxReturnUpdateDecision,
  isTaxReturnEditable,
  isTaxReturnImmutable,
  normalizeTaxReturnStatus,
} from '../workflow/taxReturnWorkflow';

describe('taxReturnWorkflow', () => {
  it('normaliza estados operativos conocidos', () => {
    expect(normalizeTaxReturnStatus('En_Revision')).toBe(TAX_RETURN_STATUS.EN_REVISION);
    expect(normalizeTaxReturnStatus('En Revisión')).toBe(TAX_RETURN_STATUS.EN_REVISION);
    expect(normalizeTaxReturnStatus('en revision')).toBe(TAX_RETURN_STATUS.EN_REVISION);
    expect(normalizeTaxReturnStatus('cerrada')).toBe(TAX_RETURN_STATUS.CERRADA);
    expect(normalizeTaxReturnStatus('')).toBe(TAX_RETURN_STATUS.BORRADOR);
  });

  it('distingue estados editables de estados inmutables', () => {
    expect(isTaxReturnEditable('Borrador')).toBe(true);
    expect(isTaxReturnEditable('En Revisión')).toBe(true);
    expect(isTaxReturnEditable('Observada')).toBe(true);

    expect(isTaxReturnImmutable('Cerrada')).toBe(true);
    expect(isTaxReturnImmutable('Presentada')).toBe(true);
    expect(isTaxReturnImmutable('Rectificada')).toBe(true);
    expect(isTaxReturnImmutable('Anulada')).toBe(true);
  });

  it('permite cerrar una DDJJ editable sin cambiar formulas ni datos auxiliares', () => {
    const decision = buildTaxReturnUpdateDecision({
      currentStatus: 'Borrador',
      requestedStatus: 'Cerrada',
    });

    expect(decision).toEqual({
      allowed: true,
      nextStatus: TAX_RETURN_STATUS.CERRADA,
      auditAction: 'CLOSE',
      persistDetails: true,
    });
  });

  it('bloquea una actualizacion comun sobre una DDJJ cerrada', () => {
    const decision = buildTaxReturnUpdateDecision({
      currentStatus: 'Cerrada',
      requestedStatus: 'Borrador',
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('La decision debio bloquear la actualizacion.');
    expect(decision.persistDetails).toBe(false);
    expect(decision.httpStatus).toBe(409);
    expect(decision.error).toContain('inmutable');
  });

  it('reabre una DDJJ inmutable solo con motivo', () => {
    expect(buildTaxReturnUpdateDecision({
      currentStatus: 'Cerrada',
      workflowAction: 'reopen',
      workflowReason: '',
    })).toMatchObject({
      allowed: false,
      httpStatus: 400,
    });

    expect(buildTaxReturnUpdateDecision({
      currentStatus: 'Cerrada',
      workflowAction: 'reopen',
      workflowReason: 'Correccion por documentacion recibida despues del cierre',
    })).toEqual({
      allowed: true,
      nextStatus: TAX_RETURN_STATUS.BORRADOR,
      auditAction: 'REOPEN',
      persistDetails: false,
      reason: 'Correccion por documentacion recibida despues del cierre',
    });
  });

  it('anula operativamente sin borrar fisicamente y exige motivo', () => {
    expect(buildTaxReturnAnnulmentDecision({
      currentStatus: 'Borrador',
      reason: ' ',
      isTechnicalRollback: false,
    })).toMatchObject({
      allowed: false,
      httpStatus: 400,
    });

    expect(buildTaxReturnAnnulmentDecision({
      currentStatus: 'Cerrada',
      reason: 'DDJJ duplicada por error de carga',
      isTechnicalRollback: false,
    })).toEqual({
      allowed: true,
      mode: 'annul',
      nextStatus: TAX_RETURN_STATUS.ANULADA,
      auditAction: 'ANNUL',
      reason: 'DDJJ duplicada por error de carga',
    });
  });

  it('reserva el borrado fisico solo para rollback tecnico de borradores', () => {
    expect(buildTaxReturnAnnulmentDecision({
      currentStatus: 'Borrador',
      reason: '',
      isTechnicalRollback: true,
    })).toEqual({
      allowed: true,
      mode: 'physical-delete',
      auditAction: 'DELETE',
      reason: 'Rollback tecnico de cabecera creada automaticamente.',
    });

    expect(buildTaxReturnAnnulmentDecision({
      currentStatus: 'Cerrada',
      reason: '',
      isTechnicalRollback: true,
    })).toMatchObject({
      allowed: false,
      httpStatus: 409,
    });
  });
});
