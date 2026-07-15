import { createHash } from 'node:crypto';

export type FixedAssetIdentityOwner = {
  id: string;
  taxReturnId: string;
};

export function resolveFixedAssetPersistenceIds({
  taxReturnId,
  requestedIds,
  occupiedIdentities,
}: {
  taxReturnId: string;
  requestedIds: Array<string | null | undefined>;
  occupiedIdentities: FixedAssetIdentityOwner[];
}): Array<string | undefined> {
  const ownerById = new Map(occupiedIdentities.map(identity => [identity.id, identity.taxReturnId]));
  const occurrenceById = new Map<string, number>();

  return requestedIds.map(rawId => {
    const requestedId = rawId?.trim();
    if (!requestedId) return undefined;

    const occurrence = occurrenceById.get(requestedId) ?? 0;
    occurrenceById.set(requestedId, occurrence + 1);

    const currentOwner = ownerById.get(requestedId);
    if (occurrence === 0 && currentOwner === taxReturnId) return requestedId;

    return buildNamespacedFixedAssetId(taxReturnId, requestedId, occurrence);
  });
}

function buildNamespacedFixedAssetId(taxReturnId: string, requestedId: string, occurrence: number): string {
  const chars = createHash('sha256')
    .update(`${taxReturnId}\0${requestedId}\0${occurrence}`)
    .digest('hex')
    .slice(0, 32)
    .split('');

  chars[12] = '8';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
