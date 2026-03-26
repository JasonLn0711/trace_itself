import { ProjectDetailPage } from '../../../../features/ProjectDetailPage';

export default async function ProjectDetailRoute({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetailPage projectId={Number(id)} />;
}
