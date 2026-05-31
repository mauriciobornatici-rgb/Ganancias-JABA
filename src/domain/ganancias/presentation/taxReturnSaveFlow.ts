export function buildCreatedTaxReturnFullSaveRequest(
  taxReturnId: string,
  payload: unknown
): { url: string; init: RequestInit } {
  return {
    url: `/api/declaraciones/${taxReturnId}`,
    init: {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  };
}

export function resolveTaxReturnSaveTarget({
  routeId,
  persistedReturnId,
}: {
  routeId?: string | null;
  persistedReturnId?: string | null;
}): {
  method: 'POST' | 'PUT';
  url: string;
  isCreate: boolean;
  taxReturnId: string | null;
} {
  const routeReturnId = routeId && routeId !== 'crear' ? routeId : '';
  const taxReturnId = persistedReturnId || routeReturnId;

  if (taxReturnId) {
    return {
      method: 'PUT',
      url: `/api/declaraciones/${taxReturnId}`,
      isCreate: false,
      taxReturnId,
    };
  }

  return {
    method: 'POST',
    url: '/api/declaraciones',
    isCreate: true,
    taxReturnId: null,
  };
}

export function buildCreatedTaxReturnRollbackRequest(
  taxReturnId: string
): { url: string; init: RequestInit } {
  return {
    url: `/api/declaraciones/${taxReturnId}`,
    init: {
      method: 'DELETE',
    },
  };
}
