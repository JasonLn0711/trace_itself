'use client';

import { FeatureGuard } from '../../../components/FeatureGuard';
import { AsrPage } from '../../../features/AsrPage';
import { canUseFeature } from '../../../lib/access';
import { useAuth } from '../../../state/AuthContext';

export default function AsrRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseFeature(user, 'asr')}>
      <AsrPage />
    </FeatureGuard>
  );
}
