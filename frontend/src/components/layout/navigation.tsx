import type { ReactNode } from 'react';
import {
  FiBarChart2, FiBell, FiCalendar, FiClipboard, FiFileText, FiHeart, FiHome, FiInbox, FiLifeBuoy, FiList, FiSettings, FiShield,
  FiUser, FiUserCheck, FiUsers,
} from 'react-icons/fi';
import type { Role } from '../../types';

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

const shared = (base: string): NavItem[] => [
  { path: `${base}/notifications`, label: 'Notifications', icon: <FiBell /> },
  { path: `${base}/profile`, label: 'Profile', icon: <FiUser /> },
  { path: `${base}/privacy`, label: 'Privacy', icon: <FiShield /> },
];

export const navigation: Record<Role, NavItem[]> = {
  EMPLOYEE: [
    { path: '/employee', label: 'Dashboard', icon: <FiHome /> },
    { path: '/employee/well-being', label: 'Well-Being Check', icon: <FiHeart /> },
    { path: '/employee/survey', label: 'OB Survey', icon: <FiClipboard /> },
    { path: '/employee/help', label: 'Need Help', icon: <FiLifeBuoy /> },
    ...shared('/employee'),
  ],
  LINE_MANAGER: [
    { path: '/manager', label: 'Dashboard', icon: <FiHome /> },
    { path: '/manager/team', label: 'Employee Overview', icon: <FiUsers /> },
    { path: '/manager/requests', label: 'Employee Requests', icon: <FiInbox /> },
    { path: '/manager/meetings', label: 'Meetings', icon: <FiCalendar /> },
    ...shared('/manager'),
  ],
  HR_ADMIN: [
    { path: '/admin', label: 'Dashboard', icon: <FiHome /> },
    { path: '/admin/users', label: 'User Management', icon: <FiUsers /> },
    { path: '/admin/assignments', label: 'Assignments', icon: <FiUserCheck /> },
    { path: '/admin/surveys', label: 'Survey Management', icon: <FiFileText /> },
    { path: '/admin/analytics', label: 'Analytics', icon: <FiBarChart2 /> },
    { path: '/admin/settings', label: 'Settings', icon: <FiSettings /> },
    { path: '/admin/audit-log', label: 'Audit Log', icon: <FiList /> },
    ...shared('/admin'),
  ],
};
