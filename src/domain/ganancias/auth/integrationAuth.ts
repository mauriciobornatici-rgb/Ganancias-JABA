import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const MIN_TOKEN_LENGTH = 32;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyUiPathIntegrationToken(
  authorization: string | null | undefined,
  configuredToken = process.env.UIPATH_INTEGRATION_TOKEN,
): boolean {
  if (!configuredToken || configuredToken.length < MIN_TOKEN_LENGTH) return false;
  if (!authorization?.startsWith('Bearer ')) return false;
  const provided = authorization.slice('Bearer '.length).trim();
  return provided.length >= MIN_TOKEN_LENGTH && safeEqual(provided, configuredToken);
}

/** Defensa primaria del endpoint externo; nunca depende solamente de proxy.ts. */
export function requireUiPathIntegrationAuth(request: NextRequest): NextResponse | null {
  if (verifyUiPathIntegrationToken(request.headers.get('authorization'))) return null;
  return NextResponse.json(
    { success: false, error: 'Credencial de integracion invalida o no configurada.' },
    { status: 401 },
  );
}
