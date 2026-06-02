import type { Decimal } from 'decimal.js';
import type { GeneralDeductionsOutput } from '../types';

export interface GeneralDeductionsBreakdownItem {
  label: string;
  reference: string;
  amount: Decimal;
}

export interface GeneralDeductionsDocumentationNotice {
  title: string;
  body: string;
  reference: string;
}

export function getGeneralDeductionsDocumentationNotice(): GeneralDeductionsDocumentationNotice {
  return {
    title: 'Carga agregada por rubro',
    body: 'La app liquida deducciones generales por importes agregados contra IG 25; no reemplaza el respaldo documental por comprobantes de la hoja Ded. Gen.',
    reference: 'Ded. Gen.',
  };
}

export function buildGeneralDeductionsBreakdown(
  deductions: GeneralDeductionsOutput | null | undefined
): GeneralDeductionsBreakdownItem[] {
  if (!deductions) return [];

  const rows: GeneralDeductionsBreakdownItem[] = [
    { label: 'Autonomos', reference: 'IG 25!F20', amount: deductions.autonomosAdmitidos },
    { label: 'Servicio domestico', reference: 'IG 25!F21', amount: deductions.servicioDomesticoTope },
    { label: 'Seguro de vida', reference: 'IG 25!F22', amount: deductions.seguroVidaTope },
    { label: 'Seguro de retiro', reference: 'IG 25!F23', amount: deductions.seguroRetiroTope },
    { label: 'Gastos de sepelio', reference: 'IG 25!F24', amount: deductions.gastosSepelioTope },
    { label: 'Intereses hipotecarios', reference: 'IG 25!F25', amount: deductions.interesesHipotecaTope },
    { label: 'Gastos educativos', reference: 'IG 25!F26', amount: deductions.gastosEducativosTope },
    { label: 'Alquiler casa habitacion', reference: 'IG 25!F27', amount: deductions.alquilerCasaHabitacionTope },
    { label: 'Locador / locatario 10%', reference: 'IG 25!F28', amount: deductions.locadorLocatarioTope },
    { label: 'Cuota medico asistencial', reference: 'IG 25!F29', amount: deductions.medicosAsistencialTope },
    { label: 'Honorarios medicos', reference: 'IG 25!F30', amount: deductions.honorariosMedicosTope },
    { label: 'Donaciones', reference: 'IG 25!F31', amount: deductions.donacionesTope },
  ];

  return rows.filter(row => !row.amount.isZero());
}
