import type { ParsedUsefulCoefficients } from '../mappers/parameterImporter';

export type TaxParameterImportAuditInput = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  fiscalYear: number;
  resolutionName: string;
  parameterSetId: string;
  version: number;
  bracketsCount: number;
  ipcCount: number;
  warnings: string[];
  usefulCoefficients: ParsedUsefulCoefficients;
};

function baseName(fileName: string): string {
  return fileName.split(/[\\/]/).filter(Boolean).pop() || fileName;
}

export function buildTaxParameterImportAuditDetails(input: TaxParameterImportAuditInput): string {
  return JSON.stringify({
    kind: 'tax-parameter-import',
    file: {
      name: baseName(input.fileName),
      size: input.fileSize,
      mimeType: input.mimeType,
    },
    fiscalYear: input.fiscalYear,
    resolution: {
      name: input.resolutionName,
      parameterSetId: input.parameterSetId,
      version: input.version,
    },
    counts: {
      brackets: input.bracketsCount,
      ipc: input.ipcCount,
    },
    warnings: input.warnings,
    usefulCoefficients: input.usefulCoefficients,
  });
}
