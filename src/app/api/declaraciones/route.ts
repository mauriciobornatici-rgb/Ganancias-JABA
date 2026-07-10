export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/generated/client/client';
import { prisma } from '@/domain/ganancias/prisma';
import { persistTaxReturnDetails } from '@/domain/ganancias/persistence/taxReturnDetailsPersistence';
import { requireRouteAuth } from '@/domain/ganancias/auth/routeAuth';
import { buildDuplicateTaxReturnCreateResponse } from '@/domain/ganancias/persistence/taxReturnDuplicate';
import {
  TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS,
  TaxReturnInvalidPayloadError,
} from '@/domain/ganancias/persistence/taxReturnPersistencePolicy';
import { buildInitialTaxReturnSnapshot } from '@/domain/ganancias/persistence/taxReturnSnapshot';
import { hasDetailedTaxReturnPayload } from '@/domain/ganancias/persistence/taxReturnPayload';
import { TAX_RETURN_STATUS } from '@/domain/ganancias/workflow/taxReturnWorkflow';
import { createTaxReturnSchema, firstValidationError } from '@/domain/ganancias/presentation/apiValidation';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');
    const includeAnnulled = searchParams.get('includeAnnulled') === 'true';

    const whereClause: Prisma.TaxReturnWhereInput = {};
    if (!includeAnnulled) {
      whereClause.status = { not: TAX_RETURN_STATUS.ANULADA };
    }
    if (clientId) {
      whereClause.clientId = clientId;
    }

    const taxReturns = await prisma.taxReturn.findMany({
      where: whereClause,
      include: {
        client: true,
        fiscalYear: true,
        calculations: {
          orderBy: { runDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // P31.2: un snapshot corrupto en UNA fila no debe tirar abajo el listado completo
    // (antes un JSON.parse fallido devolvia 500 y el dashboard quedaba "vacio").
    const safeCurrentStep = (variablesSnapshot: unknown): number => {
      if (typeof variablesSnapshot !== 'string' || variablesSnapshot === '') return 1;
      try {
        const parsed = JSON.parse(variablesSnapshot);
        const step = Number(parsed?.currentStep);
        return Number.isInteger(step) && step >= 1 && step <= 6 ? step : 1;
      } catch {
        return 1;
      }
    };

    // Mapear al formato plano que espera la interfaz de usuario
    const mapped = taxReturns.map((r) => {
      const latestCalc = r.calculations[0] || null;
      return {
        id: r.id,
        clientId: r.clientId,
        clientName: r.client?.name ?? '(sin contribuyente)',
        cuit: r.client?.cuit ?? '',
        year: r.fiscalYear?.year ?? null,
        status: r.status,
        version: r.version,
        updatedAt: r.updatedAt.toISOString().replace('T', ' ').substring(0, 16),
        impuestoAPagar: latestCalc ? latestCalc.finalBalance : 0,
        consumoCalculado: latestCalc ? latestCalc.computedConsumo : 0,
        hasWarnings: latestCalc ? latestCalc.hasErrors : false,
        currentStep: safeCurrentStep(latestCalc?.variablesSnapshot),
      };
    });

    return NextResponse.json({ success: true, data: mapped });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: `Error al obtener declaraciones: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireRouteAuth(req);
  if (authError) return authError;
  try {
    const body = await req.json();

    // P31.4: validacion zod del payload de alta antes de tocar la base.
    const parsed = createTaxReturnSchema.safeParse({
      cuit: body.cuit,
      clientName: body.clientName,
      fiscalYear: body.fiscalYear,
      status: body.status,
      taxParameterSetId: body.taxParameterSetId,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: firstValidationError(parsed) ?? 'Payload invalido.' },
        { status: 400 }
      );
    }
    const { cuit, fiscalYear, status, taxParameterSetId } = parsed.data;

    const client = await prisma.client.findUnique({
      where: { cuit },
    });

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'El contribuyente ingresado no se encuentra registrado en el padron de Clientes. Debe registrarlo previamente en la seccion de Clientes.' },
        { status: 400 }
      );
    }

    const yearInt = fiscalYear; // ya validado como entero por zod (P31.4)
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let fYear = await tx.fiscalYear.findUnique({
        where: { year: yearInt },
      });

      if (!fYear) {
        fYear = await tx.fiscalYear.create({
          data: {
            year: yearInt,
            isEnabled: true,
          },
        });
      }

      const duplicateReturn = await tx.taxReturn.findFirst({
        where: {
          clientId: client.id,
          fiscalYearId: fYear.id,
          version: 0,
        },
        select: {
          id: true,
          status: true,
          version: true,
        },
      });

      let newVersion = 0;
      if (duplicateReturn) {
        // Una DDJJ anulada se conserva para auditoría. La nueva cabecera recibe una versión
        // incremental para respetar la unicidad sin destruir el historial fiscal.
        if (duplicateReturn.status === TAX_RETURN_STATUS.ANULADA) {
          const latest = await tx.taxReturn.findFirst({
            where: { clientId: client.id, fiscalYearId: fYear.id },
            orderBy: { version: 'desc' },
            select: { version: true },
          });
          newVersion = (latest?.version ?? 0) + 1;
        } else {
          return { duplicateReturn, fYear, taxReturn: null };
        }
      }

      const taxReturn = await tx.taxReturn.create({
        data: {
          clientId: client.id,
          fiscalYearId: fYear.id,
          status: status || 'Borrador',
          version: newVersion,
          taxParameterSetId: taxParameterSetId || null,
        },
      });

      const existingReturn = {
        ...taxReturn,
        client,
        fiscalYear: fYear,
      };

      if (hasDetailedTaxReturnPayload(body)) {
        await persistTaxReturnDetails({
          db: tx,
          taxReturnId: taxReturn.id,
          existingReturn,
          payload: body,
        });
      } else {
        const variablesSnapshot = buildInitialTaxReturnSnapshot(body);
        await tx.calculationRun.create({
          data: {
            taxReturnId: taxReturn.id,
            resultThirdCategory: 0,
            resultTotalNet: 0,
            totalGeneralDeductions: 0,
            impositiveResultBeforeQuebrantos: 0,
            quebrantosApplied: 0,
            impositiveResultNet: 0,
            totalPersonalDeductions: 0,
            taxableIncome: 0,
            taxDetermined: 0,
            totalPaymentsOnAccount: 0,
            finalBalance: 0,
            computedConsumo: 0,
            justificationDiff: 0,
            axiStaticResult: 0,
            axiDynamicResult: 0,
            axiNetAdjustment: 0,
            variablesSnapshot: JSON.stringify(variablesSnapshot),
          },
        });
      }

      const savedTaxReturn = await tx.taxReturn.findUnique({
        where: { id: taxReturn.id },
        select: {
          id: true,
          status: true,
          version: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({ data: {
        action: 'CREATE',
        entityType: 'TaxReturn',
        entityId: taxReturn.id,
        clientCuit: client.cuit,
        clientName: client.name,
        fiscalYear: fYear.year,
        details: `Alta de DDJJ versión ${newVersion} en estado ${status || 'Borrador'}.`,
      } });

      return { duplicateReturn: null, taxReturn: savedTaxReturn || taxReturn, fYear };
    }, TAX_RETURN_PERSISTENCE_TRANSACTION_OPTIONS);

    if (result.duplicateReturn) {
      return NextResponse.json(
        buildDuplicateTaxReturnCreateResponse({
          id: result.duplicateReturn.id,
          status: result.duplicateReturn.status,
          version: result.duplicateReturn.version,
          fiscalYear: result.fYear.year,
        }),
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: result.taxReturn!.id,
          clientId: client.id,
          clientName: client.name,
          cuit: client.cuit,
          year: result.fYear.year,
          status: status || result.taxReturn!.status,
          version: result.taxReturn!.version,
          updatedAt: result.taxReturn!.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof TaxReturnInvalidPayloadError) {
      return NextResponse.json(
        { success: false, error: err.message, code: 'INVALID_TAX_RETURN_PAYLOAD', fieldPath: err.fieldPath },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: `Error al crear declaración: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
