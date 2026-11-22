import type { Role } from '../types';

export interface LinkTarget {
  type?: string | null;
  entityType?: string | null;
  entityId?: number | string | null;
}

/**
 * Maps a notification (from the list or from a tapped push message) to the screen it is about.
 * Used for both in-app taps and deep linking from the lock screen. Returns null for "just open the app".
 */
export function routeForNotification(target: LinkTarget, role: Role): string | null {
  const id = target.entityId != null ? String(target.entityId) : null;
  switch (target.entityType) {
    case 'wellbeing_alert':
      return id && role !== 'EMPLOYEE' ? `/alert/${id}` : role === 'EMPLOYEE' ? '/(tabs)' : null;
    case 'support_request':
      return id ? `/request/${id}` : null;
    case 'meeting':
      return id ? `/meeting/${id}` : null;
    case 'assignment':
      return role === 'EMPLOYEE' ? '/(tabs)' : role === 'LINE_MANAGER' ? '/(tabs)/employees' : null;
    default:
      return null;
  }
}
