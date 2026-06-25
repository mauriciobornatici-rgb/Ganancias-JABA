import VatSettlementWorkspace from './VatSettlementWorkspace';

export default async function VatSettlementPage({
  params,
}: {
  params: Promise<{ id: string; periodId: string }>;
}) {
  const { id, periodId } = await params;
  return <VatSettlementWorkspace clientId={id} periodId={periodId} />;
}
