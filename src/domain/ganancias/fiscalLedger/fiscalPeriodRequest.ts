import { z } from 'zod';

export const createFiscalPeriodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type CreateFiscalPeriodInput = z.output<typeof createFiscalPeriodSchema>;
