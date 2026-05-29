import { Decimal } from 'decimal.js';

export interface MockClient {
  id: string;
  cuit: string;
  name: string;
  type: string;
  fiscalCondition: string;
  mainActivity: string;
  responsibleName: string;
  status: 'Activo' | 'Suspendido' | 'Inactivo';
}

export interface MockTaxReturn {
  id: string;
  clientId: string;
  clientName: string;
  cuit: string;
  year: number;
  status: 'Borrador' | 'En Revisión' | 'Cerrada' | 'Rectificada';
  version: number;
  updatedAt: string;
  // Resultados liquidados previos o proyectados
  impuestoAPagar: Decimal;
  consumoCalculado: Decimal;
  hasWarnings: boolean;
  currentStep?: number;
}

export const mockClients: MockClient[] = [
  {
    id: 'client-1',
    cuit: '20-34590216-4',
    name: 'Lobato Francisco',
    type: 'Persona Humana',
    fiscalCondition: 'Responsable Inscripto',
    mainActivity: 'CABA - Servicios de Informática',
    responsibleName: 'JABA',
    status: 'Activo',
  },
  {
    id: 'client-2',
    cuit: '27-95430211-3',
    name: 'Maria Luz Gomez',
    type: 'Persona Humana',
    fiscalCondition: 'Responsable Inscripto / Monotributo',
    mainActivity: 'Provincia de Buenos Aires - Comercial Minorista',
    responsibleName: 'JABA',
    status: 'Activo',
  },
  {
    id: 'client-3',
    cuit: '20-11223344-9',
    name: 'Estudio Metalúrgico SRL',
    type: 'Sociedad de Hecho',
    fiscalCondition: 'Responsable Inscripto',
    mainActivity: 'Convenio Multilateral - Fabricación',
    responsibleName: 'JABA',
    status: 'Inactivo',
  }
];

export const mockTaxReturns: MockTaxReturn[] = [
  {
    id: 'return-1',
    clientId: 'client-1',
    clientName: 'Lobato Francisco',
    cuit: '20-34590216-4',
    year: 2025,
    status: 'Borrador',
    version: 0,
    updatedAt: '2026-05-27 19:45',
    impuestoAPagar: new Decimal(0),
    consumoCalculado: new Decimal(28017191),
    hasWarnings: true, // Consumo alto
    currentStep: 3,
  },
  {
    id: 'return-2',
    clientId: 'client-2',
    clientName: 'Maria Luz Gomez',
    cuit: '27-95430211-3',
    year: 2025,
    status: 'En Revisión',
    version: 0,
    updatedAt: '2026-05-26 15:30',
    impuestoAPagar: new Decimal(442996.02),
    consumoCalculado: new Decimal(12500000),
    hasWarnings: false,
    currentStep: 1,
  },
  {
    id: 'return-3',
    clientId: 'client-1',
    clientName: 'Lobato Francisco',
    cuit: '20-34590216-4',
    year: 2024,
    status: 'Cerrada',
    version: 0,
    updatedAt: '2025-05-20 18:00',
    impuestoAPagar: new Decimal(1500000),
    consumoCalculado: new Decimal(18400000),
    hasWarnings: false,
  }
];
