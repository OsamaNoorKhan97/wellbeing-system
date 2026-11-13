import { api } from '../lib/api';
import type {
  AnalyticsSummary, AppNotification, AppSetting, Assessment, AssessmentStatus, AuditEntry, EmployeeDashboard, ManagerDashboard,
  ManagerWithTeam, Meeting, RequestStatus, RequestType, Role, SupportRequest, SurveyAnalytics, SurveyQuestion, SurveyStatus,
  SurveySubmission, TeamMember, Trends, User, UserDetail,
} from '../types';

export interface Paging {
  page?: number;
  pageSize?: number;
}

export interface MeetingInput {
  scheduledAt: string;
  durationMinutes: number;
  purpose?: string | null;
  location?: string | null;
}

export const authService = {
  login: (identifier: string, password: string, rememberMe: boolean) =>
    api.post<{ token: string; expiresIn: string; user: User }>('/auth/login', { identifier, password, rememberMe }),
  register: (input: Record<string, string>) => api.post<User>('/auth/register', input),
  me: () => api.get<User>('/auth/me'),
  updateProfile: (input: { fullName: string; department?: string; designation?: string }) => api.patch<User>('/auth/me', input),
  changePassword: (input: { currentPassword: string; password: string; confirmPassword: string }) =>
    api.post<{ token: string }>('/auth/change-password', input),
  forgotPassword: (identifier: string) => api.post<{ message: string; devResetUrl?: string }>('/auth/forgot-password', { identifier }),
  resetPassword: (input: { token: string; password: string; confirmPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', input),
};

export const employeeService = {
  dashboard: () => api.get<EmployeeDashboard>('/employees/me/dashboard'),
};

export const assessmentService = {
  status: () => api.get<AssessmentStatus>('/assessments/status'),
  list: (paging: Paging) => api.get<Assessment[]>('/assessments', { ...paging }),
  submit: (ratings: { mood: number; stress: number; energy: number }) =>
    api.post<{ assessment: Assessment; status: AssessmentStatus }>('/assessments', ratings),
};

export const surveyService = {
  questions: (includeInactive = false) => api.get<SurveyQuestion[]>('/surveys/questions', { includeInactive: includeInactive || undefined }),
  status: () => api.get<SurveyStatus>('/surveys/status'),
  submit: (answers: { questionId: number; rating: number }[]) =>
    api.post<{ submission: { id: number; submittedAt: string }; status: SurveyStatus }>('/surveys/submissions', { answers }),
  submissions: (paging: Paging) => api.get<SurveySubmission[]>('/surveys/submissions', { ...paging }),
  createQuestion: (input: { text: string; category: string; displayOrder?: number; isActive?: boolean }) =>
    api.post<SurveyQuestion>('/surveys/questions', input),
  updateQuestion: (id: number, input: Partial<{ text: string; category: string; displayOrder: number; isActive: boolean }>) =>
    api.patch<SurveyQuestion>(`/surveys/questions/${id}`, input),
};

export const requestService = {
  list: (query: Paging & { type?: RequestType; status?: RequestStatus }) => api.get<SupportRequest[]>('/requests', { ...query }),
  create: (type: RequestType, reason: string) => api.post<SupportRequest>('/requests', { type, reason: reason || null }),
  approve: (id: number, comment: string) => api.post<SupportRequest>(`/requests/${id}/approve`, { comment: comment || null }),
  reject: (id: number, comment: string) => api.post<SupportRequest>(`/requests/${id}/reject`, { comment: comment || null }),
  cancel: (id: number) => api.post<SupportRequest>(`/requests/${id}/cancel`),
  schedule: (id: number, input: MeetingInput) => api.post<SupportRequest>(`/requests/${id}/schedule`, input),
};

export const meetingService = {
  list: (query: Paging & { scope: 'upcoming' | 'past' | 'all' }) => api.get<Meeting[]>('/meetings', { ...query }),
  create: (employeeId: number, input: MeetingInput) => api.post<Meeting>('/meetings', { employeeId, ...input }),
  update: (id: number, input: Partial<MeetingInput>) => api.patch<Meeting>(`/meetings/${id}`, input),
  cancel: (id: number, reason: string) => api.post<Meeting>(`/meetings/${id}/cancel`, { reason: reason || null }),
  complete: (id: number) => api.post<Meeting>(`/meetings/${id}/complete`),
};

export const notificationService = {
  list: (query: Paging & { unreadOnly?: boolean }) => api.get<AppNotification[]>('/notifications', { ...query }),
  unreadCount: () => api.get<{ unread: number }>('/notifications/unread-count'),
  markRead: (id: number) => api.post<{ id: number; isRead: boolean }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all'),
};

export const managerService = {
  dashboard: () => api.get<ManagerDashboard>('/managers/me/dashboard'),
  team: (search?: string) => api.get<TeamMember[]>('/managers/me/team', { search }),
};

export interface UserQuery extends Paging {
  search?: string;
  role?: Role | '';
  status?: 'active' | 'inactive' | '';
  department?: string;
  assignment?: 'assigned' | 'unassigned';
}

export const userService = {
  list: (query: UserQuery) => api.get<User[]>('/users', { ...query }),
  get: (id: number) => api.get<UserDetail>(`/users/${id}`),
  create: (input: Record<string, string>) => api.post<User>('/users', input),
  setStatus: (id: number, isActive: boolean) => api.patch<User>(`/users/${id}/status`, { isActive }),
  setRole: (id: number, role: Role) => api.patch<User>(`/users/${id}/role`, { role }),
};

export const assignmentService = {
  overview: () => api.get<ManagerWithTeam[]>('/assignments'),
  assign: (employeeId: number, managerId: number) => api.put<User>(`/assignments/${employeeId}`, { managerId }),
  remove: (employeeId: number) => api.delete<User>(`/assignments/${employeeId}`),
};

export const analyticsService = {
  summary: () => api.get<AnalyticsSummary>('/analytics/summary'),
  trends: (days: number) => api.get<Trends>('/analytics/trends', { days }),
  survey: () => api.get<SurveyAnalytics>('/analytics/survey'),
};

export const settingsService = {
  list: () => api.get<AppSetting[]>('/settings'),
  update: (values: Record<string, string | number>) => api.put<AppSetting[]>('/settings', values),
};

export const auditService = {
  list: (query: Paging & { action?: string; search?: string }) => api.get<AuditEntry[]>('/audit-logs', { ...query }),
  actions: () => api.get<string[]>('/audit-logs/actions'),
};
