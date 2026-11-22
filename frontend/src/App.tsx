import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { HomeRedirect, Protected, PublicOnly } from './components/layout/guards';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AnalyticsPage } from './pages/admin/AnalyticsPage';
import { AssignmentsPage } from './pages/admin/AssignmentsPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { SuperAdminDashboard } from './pages/admin/SuperAdminDashboard';
import { SurveyManagementPage } from './pages/admin/SurveyManagementPage';
import { UsersPage } from './pages/admin/UsersPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages';
import { RegisterPage } from './pages/auth/RegisterPage';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { NeedHelpPage } from './pages/employee/NeedHelpPage';
import { SurveyPage } from './pages/employee/SurveyPage';
import { WellBeingPage } from './pages/employee/WellBeingPage';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { MeetingsPage } from './pages/manager/MeetingsPage';
import { RequestsPage } from './pages/manager/RequestsPage';
import { TeamPage } from './pages/manager/TeamPage';
import { AlertsPage } from './pages/shared/AlertsPage';
import { NotFoundPage } from './pages/shared/NotFoundPage';
import { NotificationsPage } from './pages/shared/NotificationsPage';
import { PrivacyPage, PublicPrivacyPage } from './pages/shared/PrivacyPage';
import { ProfilePage } from './pages/shared/ProfilePage';
import type { Role } from './types';

const shared: [string, ReactNode][] = [
  ['notifications', <NotificationsPage />],
  ['profile', <ProfilePage />],
  ['privacy', <PrivacyPage />],
];

const portals: { role: Role; base: string; pages: [string, ReactNode][] }[] = [
  {
    role: 'EMPLOYEE',
    base: '/employee',
    pages: [['', <EmployeeDashboard />], ['well-being', <WellBeingPage />], ['survey', <SurveyPage />], ['help', <NeedHelpPage />]],
  },
  {
    role: 'LINE_MANAGER',
    base: '/manager',
    pages: [['', <ManagerDashboard />], ['team', <TeamPage />], ['alerts', <AlertsPage />], ['requests', <RequestsPage />], ['meetings', <MeetingsPage />]],
  },
  {
    role: 'HR',
    base: '/admin',
    pages: [
      ['', <AdminDashboard />],
      ['alerts', <AlertsPage />],
      ['users', <UsersPage />],
      ['assignments', <AssignmentsPage />],
      ['surveys', <SurveyManagementPage />],
      ['analytics', <AnalyticsPage />],
      // HR can see the global configuration but only the Super Admin can change it.
      ['settings', <SettingsPage />],
      ['audit-log', <AuditLogPage />],
    ],
  },
  {
    role: 'SUPER_ADMIN',
    base: '/super-admin',
    pages: [
      ['', <SuperAdminDashboard />],
      ['configuration', <SettingsPage />],
      ['alerts', <AlertsPage />],
      ['users', <UsersPage />],
      ['assignments', <AssignmentsPage />],
      ['surveys', <SurveyManagementPage />],
      ['analytics', <AnalyticsPage />],
      ['audit-log', <AuditLogPage />],
    ],
  },
];

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PublicPrivacyPage />} />
      {portals.flatMap(({ role, base, pages }) =>
        [...pages, ...shared].map(([path, page]) => {
          const fullPath = path ? `${base}/${path}` : base;
          // Keyed by path so each page starts with fresh state; the surrounding layout is reused.
          return <Route key={fullPath} path={fullPath} element={<Protected roles={[role]}><div key={fullPath}>{page}</div></Protected>} />;
        }),
      )}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
