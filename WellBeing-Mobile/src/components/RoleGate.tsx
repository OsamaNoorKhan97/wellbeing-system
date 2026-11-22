import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useAuth } from '../store/auth';
import type { Role } from '../types';

/** Renders children only for the listed roles; anyone else is sent home, so a deep link cannot reach another role's screen. */
export function RoleGate({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  if (!allow.includes(user.role)) return <Redirect href={'/(tabs)' as never} />;
  return <>{children}</>;
}
