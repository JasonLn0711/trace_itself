'use client';

import { FeatureGuard } from '../../../components/FeatureGuard';
import { ProjectsPage } from '../../../features/ProjectsPage';
import { canUseFeature } from '../../../lib/access';
import { useAuth } from '../../../state/AuthContext';

export default function ProjectsRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseFeature(user, 'project_tracer')}>
      <ProjectsPage />
    </FeatureGuard>
  );
}
