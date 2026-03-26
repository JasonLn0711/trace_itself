import { AdminGuard } from '../../../components/AdminGuard';
import { UsersPage } from '../../../features/UsersPage';

export default function UsersRoute() {
  return (
    <AdminGuard>
      <UsersPage />
    </AdminGuard>
  );
}
