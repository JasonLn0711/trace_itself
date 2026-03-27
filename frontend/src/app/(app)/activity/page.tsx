import { AdminGuard } from '../../../components/AdminGuard';
import { ActivityPage } from '../../../features/ActivityPage';

export default function ActivityRoute() {
  return (
    <AdminGuard>
      <ActivityPage />
    </AdminGuard>
  );
}
