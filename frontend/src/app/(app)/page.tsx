'use client';

import { FeatureGuard } from '../../components/FeatureGuard';
import { DashboardPage } from '../../features/DashboardPage';
import { canUseFeature } from '../../lib/access';
import { useAuth } from '../../state/AuthContext';

export default function DashboardRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseFeature(user, 'project_tracer')}>
      <DashboardPage />
    </FeatureGuard>
  );
}
