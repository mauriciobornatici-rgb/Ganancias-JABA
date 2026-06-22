import { describe, expect, it } from 'vitest';

const profileValidationModulePath = '../fiscalLedger/profileValidation';

describe('client fiscal profile validation', () => {
  it('rejects CM general without approved CM05 coefficients totaling one', async () => {
    const profileValidation = await import(profileValidationModulePath).catch(() => null);

    expect(profileValidation).not.toBeNull();
    if (!profileValidation) return;

    expect(() => profileValidation.validateClientTaxProfile({
      vatCondition: 'RESPONSABLE_INSCRIPTO',
      grossIncomeRegime: 'CM_REGIMEN_GENERAL',
      conventionRegime: 'GENERAL',
      activities: [{ activityCode: '259900', description: 'Metalurgica', isPrimary: true }],
      jurisdictions: [{ jurisdictionCode: '901', isActive: true }],
    })).toThrow('coeficientes CM05');
  });

  it('accepts ARBA local without CM coefficients', async () => {
    const profileValidation = await import(profileValidationModulePath).catch(() => null);

    expect(profileValidation).not.toBeNull();
    if (!profileValidation) return;

    const result = profileValidation.validateClientTaxProfile({
      vatCondition: 'RESPONSABLE_INSCRIPTO',
      grossIncomeRegime: 'ARBA_LOCAL',
      conventionRegime: 'NONE',
      activities: [{ activityCode: '471120', description: 'Comercio', isPrimary: true }],
      jurisdictions: [{ jurisdictionCode: '902', isActive: true }],
    });

    expect(result.grossIncomeRegime).toBe('ARBA_LOCAL');
  });
});
