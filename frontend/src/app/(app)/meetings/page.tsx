'use client';

import { FeatureGuard } from '../../../components/FeatureGuard';
import { MeetingsPage } from '../../../features/MeetingsPage';
import { canUseMeetings } from '../../../lib/access';
import { useAuth } from '../../../state/AuthContext';

export default function MeetingsRoute() {
  const { user } = useAuth();
  return (
    <FeatureGuard allowed={canUseMeetings(user)}>
      <MeetingsPage />
    </FeatureGuard>
  );
}
