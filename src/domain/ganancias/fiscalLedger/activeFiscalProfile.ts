export type DatedFiscalProfile = {
  id: string;
  validFrom: Date;
  validTo: Date | null;
};

function periodEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

export function resolveActiveFiscalProfile<T extends DatedFiscalProfile>(
  profiles: T[],
  year: number,
  month: number,
): T | null {
  const targetDate = periodEnd(year, month);

  return profiles
    .filter(profile => profile.validFrom <= targetDate && (profile.validTo === null || profile.validTo >= targetDate))
    .toSorted((left, right) => right.validFrom.getTime() - left.validFrom.getTime())
    .at(0) ?? null;
}
