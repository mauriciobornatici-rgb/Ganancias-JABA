import { z } from 'zod';

export const clientReactivationRequestSchema = z.object({
  action: z.literal('reactivate'),
}).strict();

export function canReactivateClient(status: string): boolean {
  return status === 'Inactivo';
}

export function canStartClientWork(status: string | null | undefined): boolean {
  return status !== 'Inactivo';
}
