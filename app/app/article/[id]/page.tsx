import Reader from '../../../pages/Reader';

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Reader assetId={id} />;
}
