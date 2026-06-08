export const WIZARD_UNSAVED_EXIT_MESSAGE =
  'Hay una liquidacion en edicion. Antes de salir, use Guardar como Borrador para asegurar los datos cargados.';

type WizardExitGuardInput = {
  hasStartedDeclaration: boolean;
  isPersisting: boolean;
};

export function shouldWarnBeforeWizardExit({
  hasStartedDeclaration,
  isPersisting,
}: WizardExitGuardInput): boolean {
  return hasStartedDeclaration && !isPersisting;
}
