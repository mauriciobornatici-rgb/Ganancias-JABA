import MonthlyFiscalDashboard from './MonthlyFiscalDashboard';

export default async function FiscalPeriodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MonthlyFiscalDashboard clientId={id} />;
}
