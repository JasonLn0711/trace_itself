'use client';

import { FeatureGuard } from '../../../components/FeatureGuard';
import { MeetingsPage } from '../../../features/MeetingsPage';
import { canUseAudioWorkspace } from '../../../lib/access';
import { useAuth } from '../../../state/AuthContext';

export default function MeetingsRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseAudioWorkspace(user)}>
      <MeetingsPage />
    </FeatureGuard>
  );
}
