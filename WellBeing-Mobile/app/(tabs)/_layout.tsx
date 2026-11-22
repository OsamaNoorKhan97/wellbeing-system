import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { notificationService } from '../../src/api/services';
import { IconButton, type IconName } from '../../src/components/ui';
import { colors } from '../../src/constants/theme';
import { useApi } from '../../src/hooks/useData';
import { useAuth } from '../../src/store/auth';
import type { Role } from '../../src/types';

interface TabDef {
  name: string;
  icon: IconName;
  /** Which roles see this tab, with the title each role gets. */
  roles: Partial<Record<Role, string>>;
}

/**
 * One tab navigator for all four roles. A tab a role may not use is hidden (href: null), and every screen
 * behind it also checks the role itself, so deep links cannot reach another role's screens.
 */
export const TABS: TabDef[] = [
  { name: 'index', icon: 'home', roles: { EMPLOYEE: 'Home', LINE_MANAGER: 'Home', HR: 'Home', SUPER_ADMIN: 'Home' } },
  { name: 'assessments', icon: 'pulse', roles: { EMPLOYEE: 'Assessments' } },
  { name: 'help', icon: 'hand-left', roles: { EMPLOYEE: 'Need Help' } },
  { name: 'employees', icon: 'people', roles: { LINE_MANAGER: 'Employees', HR: 'Employees', SUPER_ADMIN: 'Users' } },
  { name: 'alerts', icon: 'warning', roles: { LINE_MANAGER: 'Alerts', HR: 'Alerts' } },
  { name: 'meetings', icon: 'calendar', roles: { LINE_MANAGER: 'Meetings' } },
  { name: 'reports', icon: 'stats-chart', roles: { HR: 'Reports', SUPER_ADMIN: 'Analytics' } },
  { name: 'settings', icon: 'settings', roles: { SUPER_ADMIN: 'Settings' } },
  { name: 'notifications', icon: 'notifications', roles: { EMPLOYEE: 'Notifications' } },
  { name: 'profile', icon: 'person-circle', roles: { EMPLOYEE: 'Profile', LINE_MANAGER: 'Profile', HR: 'Profile', SUPER_ADMIN: 'Profile' } },
];


export default function TabsLayout() {
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const unread = useApi(['notifications', 'unread'], () => notificationService.unreadCount(), { refetchInterval: 30_000, enabled: !!user });
  if (!user) return <Redirect href={'/login' as never} />;
  const role = user.role;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { height: Platform.OS === 'ios' ? 86 : 64, paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 26 : 8 },
        headerRight:
          role === 'EMPLOYEE'
            ? undefined
            : () => <IconButton icon="notifications-outline" label="Notifications" color={"#fff"} badge={unread.data?.unread} onPress={() => router.push('/inbox' as never)} />,
      }}
    >
      {TABS.map((tab) => {
        const title = tab.roles[role];
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: title ?? tab.name,
              href: title ? undefined : null,
              tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={color as string} />,
              tabBarBadge: tab.name === 'notifications' && unread.data?.unread ? unread.data.unread : undefined,
              tabBarButtonTestID: `tab-${tab.name}`,
            }}
          />
        );
      })}
    </Tabs>
  );
}
