import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  requireUiPathIntegrationAuth,
  verifyUiPathIntegrationToken,
} from '../auth/integrationAuth';

const token = 'uipath-integration-token-with-32-chars-minimum';

describe('UiPath integration auth', () => {
  it('acepta exclusivamente un bearer token configurado y coincidente', () => {
    expect(verifyUiPathIntegrationToken(`Bearer ${token}`, token)).toBe(true);
    expect(verifyUiPathIntegrationToken(`Bearer ${token}x`, token)).toBe(false);
    expect(verifyUiPathIntegrationToken(token, token)).toBe(false);
    expect(verifyUiPathIntegrationToken(null, token)).toBe(false);
  });

  it('queda deshabilitada cuando la credencial es corta o inexistente', () => {
    expect(verifyUiPathIntegrationToken('Bearer corto', 'corto')).toBe(false);
    expect(verifyUiPathIntegrationToken(`Bearer ${token}`, undefined)).toBe(false);
  });

  it('responde 401 sin exponer detalles del token', () => {
    const request = new NextRequest('http://localhost/api/integrations/uipath/preflight', {
      method: 'POST',
    });
    const previous = process.env.UIPATH_INTEGRATION_TOKEN;
    delete process.env.UIPATH_INTEGRATION_TOKEN;
    try {
      const response = requireUiPathIntegrationAuth(request);
      expect(response?.status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.UIPATH_INTEGRATION_TOKEN;
      else process.env.UIPATH_INTEGRATION_TOKEN = previous;
    }
  });
});
