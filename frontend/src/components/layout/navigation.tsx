import type { ReactNode } from 'react';
import {
  FiAlertTriangle, FiBarChart2, FiBell, FiCalendar, FiClipboard, FiFileText, FiHeart, FiHome, FiInbox, FiLifeBuoy, FiList, FiSettings,
  FiShield, FiSliders, FiUser, FiUserCheck, FiUsers,
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
    { path: '/manager/alerts', label: 'Well-Being Alerts', icon: <FiAlertTriangle /> },
    { path: '/manager/requests', label: 'Employee Requests', icon: <FiInbox /> },
    { path: '/manager/meetings', label: 'Meetings', icon: <FiCalendar /> },
    ...shared('/manager'),
  ],
  HR: [
    { path: '/admin', label: 'Dashboard', icon: <FiHome /> },
    { path: '/admin/alerts', label: 'Well-Being Alerts', icon: <FiAlertTriangle /> },
    { path: '/admin/users', label: 'User Management', icon: <FiUsers /> },
    { path: '/admin/assignments', label: 'Assignments', icon: <FiUserCheck /> },
    { path: '/admin/surveys', label: 'Survey Management', icon: <FiFileText /> },
    { path: '/admin/analytics', label: 'Analytics', icon: <FiBarChart2 /> },
    { path: '/admin/settings', label: 'Settings', icon: <FiSettings /> },
    { path: '/admin/audit-log', label: 'Audit Log', icon: <FiList /> },
    ...shared('/admin'),
  ],
  SUPER_ADMIN: [
    { path: '/super-admin', label: 'Dashboard', icon: <FiHome /> },
    { path: '/super-admin/configuration', label: 'System Configuration', icon: <FiSliders /> },
    { path: '/super-admin/alerts', label: 'Well-Being Alerts', icon: <FiAlertTriangle /> },
    { path: '/super-admin/users', label: 'User Management', icon: <FiUsers /> },
    { path: '/super-admin/assignments', label: 'Assignments', icon: <FiUserCheck /> },
    { path: '/super-admin/surveys', label: 'Survey Management', icon: <FiFileText /> },
    { path: '/super-admin/analytics', label: 'Analytics', icon: <FiBarChart2 /> },
    { path: '/super-admin/audit-log', label: 'Activity & Configuration Log', icon: <FiList /> },
    ...shared('/super-admin'),
  ],
};
