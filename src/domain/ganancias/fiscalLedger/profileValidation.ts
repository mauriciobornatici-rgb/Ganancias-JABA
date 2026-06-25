import { z } from 'zod';

const activitySchema = z.object({
  activityCode: z.string().trim().min(1),
  description: z.string().trim().min(1),
  isPrimary: z.boolean(),
});

const jurisdictionSchema = z.object({
  jurisdictionCode: z.string().trim().min(1),
  isActive: z.boolean(),
});

const coefficientSchema = z.object({
  jurisdictionCode: z.string().trim().min(1),
  unifiedCoefficient: z.coerce.number().min(0).max(1),
});

const profileSchema = z.object({
  vatCondition: z.enum(['RESPONSABLE_INSCRIPTO', 'EXENTO', 'MONOTRIBUTO', 'OTRO']),
  grossIncomeRegime: z.enum(['NONE', 'ARBA_LOCAL', 'CM_REGIMEN_GENERAL', 'CM_REGIMEN_ESPECIAL', 'ARBA_SIMPLIFICADO']),
  conventionRegime: z.enum(['NONE', 'GENERAL', 'ESPECIAL']),
  activities: z.array(activitySchema).min(1),
  jurisdictions: z.array(jurisdictionSchema).min(1),
  coefficientVersion: z.object({
    approvedAt: z.coerce.date(),
    lines: z.array(coefficientSchema).min(1),
  }).optional(),
});

export type ClientTaxProfileInput = z.input<typeof profileSchema>;
export type ValidatedClientTaxProfile = z.output<typeof profileSchema>;

export function validateClientTaxProfile(input: ClientTaxProfileInput): ValidatedClientTaxProfile {
  const profile = profileSchema.parse(input);

  if (profile.grossIncomeRegime === 'CM_REGIMEN_GENERAL') {
    if (!profile.coefficientVersion) {
      throw new Error('Convenio Multilateral requiere coeficientes CM05 aprobados que sumen exactamente uno.');
    }

    const total = profile.coefficientVersion.lines.reduce((sum, line) => sum + line.unifiedCoefficient, 0);
    if (Math.abs(total - 1) > 0.000001) {
      throw new Error('Los coeficientes CM05 aprobados deben sumar exactamente uno.');
    }
  }

  return profile;
}
