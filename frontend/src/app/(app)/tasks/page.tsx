'use client';

import { FeatureGuard } from '../../../components/FeatureGuard';
import { TasksPage } from '../../../features/TasksPage';
import { canUseFeature } from '../../../lib/access';
import { useAuth } from '../../../state/AuthContext';

export default function TasksRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseFeature(user, 'project_tracer')}>
      <TasksPage />
    </FeatureGuard>
  );
}
