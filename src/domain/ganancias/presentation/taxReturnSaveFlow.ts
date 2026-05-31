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
