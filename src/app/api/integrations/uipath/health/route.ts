export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUiPathIntegrationAuth } from '@/domain/ganancias/auth/integrationAuth';

export async function GET(request: NextRequest) {
  const authError = requireUiPathIntegrationAuth(request);
  if (authError) return authError;
  return NextResponse.json({ success: true, service: 'ganancias-uipath-integration', mode: 'INSERT_ONLY' });
}
