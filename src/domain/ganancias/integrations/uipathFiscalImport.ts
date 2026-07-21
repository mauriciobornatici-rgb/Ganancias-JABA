import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { parseAfipFiscalLedgerDocuments } from '../mappers/afipFiscalLedgerImporter';
import { MAX_IMPORT_TOTAL_BYTES } from '../presentation/apiValidation';
import { analyzeFiscalDocuments } from '../persistence/fiscalLedgerPersistence';
import { prisma } from '../prisma';
import { resolveActiveFiscalProfile } from '../fiscalLedger/activeFiscalProfile';
import { buildFiscalPeriodSourceMutationDecision } from '../workflow/fiscalPeriodWorkflow';
import type { FiscalDocumentDraft } from '../fiscalLedger/types';
import {
  buildUiPathImportIdempotencyKey,
  normalizeIntegrationCuit,
  parseIntegrationPeriod,
} from './uipathImportContract';

export { buildUiPathImportIdempotencyKey, normalizeIntegrationCuit, parseIntegrationPeriod } from './uipathImportContract';

export type UiPathImportFile = {
  fileName: string;
  fileBuffer: Buffer;
};

export type UiPathImportManifestEntry = {
  fileName: string;
  fileHash: string;
  size: number;
  documents: number;
};

export type PreparedUiPathImport = {
  ownerCuit: string;
  year: number;
  month: number;
  client: { id: string; cuit: string; name: string } | null;
  fiscalPeriodId: string | null;
  taxProfileId: string | null;
  periodWillBeCreated: boolean;
  documents: FiscalDocumentDraft[];
  manifest: UiPathImportManifestEntry[];
  idempotencyKey: string;
  inserted: number;
  duplicates: number;
  conflictKeys: string[];
  totalAmount: number;
  errors: string[];
  canImport: boolean;
};

export async function readUiPathImportFiles(formData: FormData): Promise<UiPathImportFile[]> {
  const files = formData.getAll('files').filter((value): value is File => value instanceof File);
  const legacy = formData.get('file');
  if (legacy instanceof File) files.push(legacy);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_IMPORT_TOTAL_BYTES) {
    throw new Error(`El lote supera el maximo de ${Math.round(MAX_IMPORT_TOTAL_BYTES / (1024 * 1024))} MB.`);
  }
  return Promise.all(files.map(async file => ({
    fileName: file.name,
    fileBuffer: Buffer.from(await file.arrayBuffer()),
  })));
}

export async function prepareUiPathFiscalImport(input: {
  ownerCuit: string;
  period: string;
  files: UiPathImportFile[];
}): Promise<PreparedUiPathImport> {
  const ownerCuit = normalizeIntegrationCuit(input.ownerCuit);
  const parsedPeriod = parseIntegrationPeriod(input.period);
  const errors: string[] = [];
  if (ownerCuit.length !== 11) errors.push('El CUIT debe tener 11 digitos.');
  if (!parsedPeriod) errors.push('El periodo debe tener formato AAAAMM.');
  if (input.files.length === 0) errors.push('No se recibieron archivos.');

  const fallbackPeriod = parsedPeriod ?? { year: 0, month: 0 };
  const documents: FiscalDocumentDraft[] = [];
  const manifest: UiPathImportManifestEntry[] = [];
  for (const file of input.files) {
    const parsed = parseAfipFiscalLedgerDocuments(
      { fileName: file.fileName, fileBuffer: file.fileBuffer },
      { ownerCuit },
    );
    documents.push(...parsed.documents);
    errors.push(...parsed.errors);
    manifest.push({
      fileName: file.fileName,
      fileHash: createHash('sha256').update(file.fileBuffer).digest('hex'),
      size: file.fileBuffer.length,
      documents: parsed.documents.length,
    });
  }
  if (input.files.length > 0 && documents.length === 0) {
    errors.push('No se pudo compilar ningun comprobante del lote.');
  }

  if (parsedPeriod) {
    for (const document of documents) {
      if (document.issueDate.getUTCFullYear() !== parsedPeriod.year || document.issueDate.getUTCMonth() + 1 !== parsedPeriod.month) {
        errors.push(`${document.sourceFileName ?? 'Archivo'}: el comprobante ${document.voucherNumber} no pertenece a ${input.period}.`);
      }
    }
  }

  const clients = ownerCuit.length === 11
    ? await prisma.client.findMany({ select: { id: true, cuit: true, name: true, status: true } })
    : [];
  const matched = clients.find(client => normalizeIntegrationCuit(client.cuit) === ownerCuit) ?? null;
  const client = matched ? { id: matched.id, cuit: matched.cuit, name: matched.name } : null;
  if (!matched) errors.push('No existe un contribuyente de Ganancias con ese CUIT.');
  else if (matched.status.toLowerCase() !== 'activo') errors.push('El contribuyente esta inactivo en Ganancias.');

  let fiscalPeriodId: string | null = null;
  let taxProfileId: string | null = null;
  let periodWillBeCreated = false;
  let inserted = uniqueDocumentCount(documents);
  let duplicates = documents.length - inserted;
  let conflictKeys: string[] = [];

  if (matched && parsedPeriod) {
    const fiscalPeriod = await prisma.fiscalPeriod.findUnique({
      where: { clientId_year_month: { clientId: matched.id, year: parsedPeriod.year, month: parsedPeriod.month } },
      select: {
        id: true,
        taxProfileId: true,
        vatSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
        grossIncomeSettlements: { orderBy: { version: 'desc' }, take: 1, select: { status: true } },
      },
    });
    if (fiscalPeriod) {
      fiscalPeriodId = fiscalPeriod.id;
      taxProfileId = fiscalPeriod.taxProfileId;
      const decision = buildFiscalPeriodSourceMutationDecision({
        vatStatus: fiscalPeriod.vatSettlements[0]?.status,
        grossIncomeStatus: fiscalPeriod.grossIncomeSettlements[0]?.status,
      });
      if (!decision.allowed) errors.push(decision.error);
      const analysis = await analyzeFiscalDocuments(prisma, fiscalPeriod.id, documents);
      inserted = analysis.newDocuments;
      duplicates = analysis.duplicates;
      conflictKeys = analysis.conflictKeys;
    } else {
      const profiles = await prisma.clientTaxProfileVersion.findMany({
        where: { clientId: matched.id },
        select: { id: true, validFrom: true, validTo: true },
      });
      const profile = resolveActiveFiscalProfile(profiles, parsedPeriod.year, parsedPeriod.month);
      if (!profile) errors.push('No existe un perfil fiscal vigente para crear el periodo.');
      else {
        taxProfileId = profile.id;
        periodWillBeCreated = true;
      }
    }
  }

  if (conflictKeys.length > 0) {
    errors.push(`Hay ${conflictKeys.length} comprobante(s) existentes con contenido diferente. No se modificara ninguno.`);
  }

  const deduplicatedErrors = [...new Set(errors)];
  const totalAmount = Number(documents.reduce((sum, document) => sum.add(document.totalAmount), new Decimal(0)).toFixed(2));
  return {
    ownerCuit,
    year: fallbackPeriod.year,
    month: fallbackPeriod.month,
    client,
    fiscalPeriodId,
    taxProfileId,
    periodWillBeCreated,
    documents,
    manifest,
    idempotencyKey: buildUiPathImportIdempotencyKey(ownerCuit, input.period, manifest),
    inserted,
    duplicates,
    conflictKeys,
    totalAmount,
    errors: deduplicatedErrors,
    canImport: deduplicatedErrors.length === 0 && documents.length > 0,
  };
}

function uniqueDocumentCount(documents: FiscalDocumentDraft[]): number {
  return new Set(documents.map(document => document.documentKey)).size;
}
