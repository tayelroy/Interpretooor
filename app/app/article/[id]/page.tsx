import Reader from '../../../pages/Reader';

export default function ArticlePage({ params }: { params: { id: string } }) {
  return <Reader assetId={params.id} />;
}
