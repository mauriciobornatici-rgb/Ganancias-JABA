export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/domain/ganancias/prisma';
import { buildOperationalHealthReport } from '@/domain/ganancias/operations/operationalHealth';

export async function GET() {
  const report = await buildOperationalHealthReport({
    databaseUrl: process.env.DATABASE_URL,
    databaseCheck: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    env: {
      vercelEnv: process.env.VERCEL_ENV || process.env.NODE_ENV,
      gitBranch: process.env.VERCEL_GIT_COMMIT_REF,
    },
  });

  return NextResponse.json(
    {
      success: report.status === 'ok',
      data: report,
    },
    { status: report.status === 'ok' ? 200 : 503 }
  );
}
