import { Decimal } from 'decimal.js';
import type {
  BankAccountInput,
  CashInput,
  FixedAssetInput,
  InventoryInput,
  PayableInput,
  ReceivableInput,
} from '../types';

export type ClosingCommercialPatrimonyInput = {
  bankAccounts: BankAccountInput[];
  cashHoldings: CashInput[];
  receivables: ReceivableInput[];
  inventories: InventoryInput[];
  fixedAssets: FixedAssetInput[];
  liabilities: PayableInput[];
};

export type ClosingCommercialPatrimonyResult = {
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  patrimonioComercialCierre: Decimal;
  hasClosingCommercialData: boolean;
};

function hasNonZeroValue(value: Decimal.Value | null | undefined): boolean {
  return !new Decimal(value ?? 0).isZero();
}

export function calculateClosingCommercialPatrimony(
  input: ClosingCommercialPatrimonyInput
): ClosingCommercialPatrimonyResult {
  const totalBanks = input.bankAccounts.reduce(
    (sum, acc) => sum.add(new Decimal(acc.nominalFinal).mul(acc.tcFinal ?? 1)),
    new Decimal(0)
  );
  const totalCash = input.cashHoldings.reduce(
    (sum, cash) => sum.add(new Decimal(cash.nominalFinal).mul(cash.tcFinal ?? 1)),
    new Decimal(0)
  );
  const totalReceivables = input.receivables.reduce(
    (sum, rec) => sum.add(new Decimal(rec.balanceFinal)),
    new Decimal(0)
  );
  const totalInventory = input.inventories.reduce(
    (sum, inv) => sum.add(new Decimal(inv.finalStock)),
    new Decimal(0)
  );
  const totalFixedAssets = input.fixedAssets.reduce(
    (sum, asset) => asset.isRetired ? sum : sum.add(new Decimal(asset.originalCost)),
    new Decimal(0)
  );
  const totalLiabilities = input.liabilities.reduce(
    (sum, liab) => sum.add(new Decimal(liab.balanceFinal)),
    new Decimal(0)
  );

  const totalAssets = totalBanks
    .add(totalCash)
    .add(totalReceivables)
    .add(totalInventory)
    .add(totalFixedAssets);

  const hasClosingCommercialData =
    input.bankAccounts.some(acc => hasNonZeroValue(acc.nominalInitial) || hasNonZeroValue(acc.nominalFinal)) ||
    input.cashHoldings.some(cash => hasNonZeroValue(cash.nominalInitial) || hasNonZeroValue(cash.nominalFinal)) ||
    input.receivables.some(rec => hasNonZeroValue(rec.balanceInitial) || hasNonZeroValue(rec.balanceFinal)) ||
    input.inventories.some(inv => hasNonZeroValue(inv.initialStock) || hasNonZeroValue(inv.finalStock)) ||
    input.fixedAssets.some(asset => hasNonZeroValue(asset.originalCost) || asset.isRetired === true) ||
    input.liabilities.some(liab => hasNonZeroValue(liab.balanceInitial) || hasNonZeroValue(liab.balanceFinal));

  return {
    totalAssets,
    totalLiabilities,
    patrimonioComercialCierre: hasClosingCommercialData ? totalAssets.sub(totalLiabilities) : new Decimal(0),
    hasClosingCommercialData,
  };
}
