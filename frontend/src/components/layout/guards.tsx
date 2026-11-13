import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleHome } from '../../lib/format';
import type { Role } from '../../types';
import { PageLoader } from '../ui';
import { AppLayout } from './AppLayout';

/**
 * Renders the page inside the application shell only for a signed-in user with one of the allowed roles.
 * This is a convenience for the user; the API enforces the same rules on every request.
 */
export function Protected({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={roleHome[user.role]} replace />;
  return <AppLayout>{children}</AppLayout>;
}

/** Login, registration and password pages: signed-in users are sent to their dashboard instead. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  if (initializing) return <PageLoader label="Checking your session…" />;
  if (user) return <Navigate to={roleHome[user.role]} replace />;
  return <>{children}</>;
}

export function HomeRedirect() {
  const { user, initializing } = useAuth();
  if (initializing) return <PageLoader label="Checking your session…" />;
  return <Navigate to={user ? roleHome[user.role] : '/login'} replace />;
}
