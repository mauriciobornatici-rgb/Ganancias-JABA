import AnnualProgressReport from './AnnualProgressReport';

export default async function AnnualConsolidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnnualProgressReport clientId={id} />;
}
