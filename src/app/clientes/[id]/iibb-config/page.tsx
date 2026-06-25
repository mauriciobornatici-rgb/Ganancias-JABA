import IibbConfigEditor from './IibbConfigEditor';

export default async function IibbConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IibbConfigEditor clientId={id} />;
}
