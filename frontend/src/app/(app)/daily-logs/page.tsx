'use client';

import { FeatureGuard } from '../../../components/FeatureGuard';
import { DailyLogsPage } from '../../../features/DailyLogsPage';
import { canUseFeature } from '../../../lib/access';
import { useAuth } from '../../../state/AuthContext';

export default function DailyLogsRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseFeature(user, 'project_tracer')}>
      <DailyLogsPage />
    </FeatureGuard>
  );
}
