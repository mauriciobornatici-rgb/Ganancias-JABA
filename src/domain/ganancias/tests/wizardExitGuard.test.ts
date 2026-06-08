import { describe, expect, it } from 'vitest';
import {
  WIZARD_UNSAVED_EXIT_MESSAGE,
  shouldWarnBeforeWizardExit,
} from '../presentation/wizardExitGuard';

describe('wizardExitGuard', () => {
  it('advierte antes de salir si hay una liquidacion iniciada y no se esta guardando', () => {
    expect(shouldWarnBeforeWizardExit({
      hasStartedDeclaration: true,
      isPersisting: false,
    })).toBe(true);
  });

  it('no advierte si no hay carga iniciada o si el sistema ya esta persistiendo', () => {
    expect(shouldWarnBeforeWizardExit({
      hasStartedDeclaration: false,
      isPersisting: false,
    })).toBe(false);

    expect(shouldWarnBeforeWizardExit({
      hasStartedDeclaration: true,
      isPersisting: true,
    })).toBe(false);
  });

  it('usa un mensaje operativo que recomienda guardar borrador', () => {
    expect(WIZARD_UNSAVED_EXIT_MESSAGE).toContain('Guardar como Borrador');
  });
});
