import { AdminHome } from '../../src/screens/AdminHome';
import { EmployeeHome } from '../../src/screens/EmployeeHome';
import { ManagerHome } from '../../src/screens/ManagerHome';
import { useAuth } from '../../src/store/auth';

/** Role-specific dashboard. */
export default function Home() {
  const role = useAuth((s) => s.user?.role);
  if (role === 'EMPLOYEE') return <EmployeeHome />;
  if (role === 'LINE_MANAGER') return <ManagerHome />;
  if (role === 'HR' || role === 'SUPER_ADMIN') return <AdminHome />;
  return null;
}
