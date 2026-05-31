export function buildDuplicateTaxReturnCreateResponse({
  id,
  status,
  version,
  fiscalYear,
}: {
  id: string;
  status: string;
  version: number;
  fiscalYear: number;
}): {
  success: false;
  code: 'DUPLICATE_TAX_RETURN';
  error: string;
  data: {
    id: string;
    status: string;
    version: number;
  };
} {
  return {
    success: false,
    code: 'DUPLICATE_TAX_RETURN',
    error: `Ya existe una DDJJ original para el periodo ${fiscalYear}. Abra la declaracion existente para continuar la carga.`,
    data: {
      id,
      status,
      version,
    },
  };
}
