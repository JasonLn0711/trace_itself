'use client';

import { useParams } from 'next/navigation';
import { FeatureGuard } from '../../../../components/FeatureGuard';
import { ProjectDetailPage } from '../../../../features/ProjectDetailPage';
import { canUseFeature } from '../../../../lib/access';
import { useAuth } from '../../../../state/AuthContext';

export default function ProjectDetailRoute() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const projectId = Number(params?.id);

  return (
    <FeatureGuard allowed={canUseFeature(user, 'project_tracer')}>
      <ProjectDetailPage projectId={projectId} />
    </FeatureGuard>
  );
}
