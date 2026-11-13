export type Role = 'EMPLOYEE' | 'LINE_MANAGER' | 'HR_ADMIN';

export interface User {
  id: number;
  fullName: string;
  email: string;
  employeeId: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  department: string | null;
  designation: string | null;
  managerId: number | null;
  managerName: string | null;
  teamSize: number;
}

export interface UserDetail extends User {
  activity: {
    assessmentCount: number;
    lastAssessmentAt: string | null;
    surveyCount: number;
    lastSurveyAt: string | null;
    requestCount: number;
    pendingRequestCount: number;
  };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread?: number;
}

export interface Assessment {
  id: number;
  mood: number;
  stress: number;
  energy: number;
  submittedAt: string;
}

export interface AssessmentStatus {
  limit: number;
  usedToday: number;
  remaining: number;
  canSubmit: boolean;
  nextAvailableAt: string | null;
  timezone: string;
  latestToday: Assessment | null;
}

export interface SurveyQuestion {
  id: number;
  text: string;
  category: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyStatus {
  completed: boolean;
  lastSubmittedAt: string | null;
  nextAvailableAt: string | null;
  frequencyDays: number;
  activeQuestionCount: number;
}

export interface SurveySubmission {
  id: number;
  submittedAt: string;
  responses: { questionId: number; text: string; category: string; rating: number }[];
}

export type RequestType = 'BREAK' | 'DISCUSSION';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface SupportRequest {
  id: number;
  type: RequestType;
  status: RequestStatus;
  reason: string | null;
  managerComment: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  employeeDepartment: string | null;
  managerId: number;
  managerName: string;
  meetingId: number | null;
  meetingAt: string | null;
  meetingDurationMinutes: number | null;
  meetingPurpose: string | null;
  meetingLocation: string | null;
}

export type MeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface Meeting {
  id: number;
  requestId: number | null;
  scheduledAt: string;
  durationMinutes: number;
  purpose: string | null;
  location: string | null;
  status: MeetingStatus;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  managerId: number;
  managerName: string;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  relatedUserId: number | null;
  relatedUserName: string | null;
}

export interface ManagerSummary {
  id: number;
  fullName: string;
  email: string;
}

export interface EmployeeDashboard {
  assessmentStatus: AssessmentStatus;
  recentAssessments: Assessment[];
  surveyStatus: SurveyStatus;
  recentRequests: SupportRequest[];
  upcomingMeetings: Meeting[];
  recentNotifications: AppNotification[];
  unreadNotifications: number;
  manager: ManagerSummary | null;
}

export interface TeamMember {
  id: number;
  fullName: string;
  employeeId: string;
  email: string;
  department: string | null;
  designation: string | null;
  isActive: boolean;
  assignedAt: string;
  lastCheckInAt: string | null;
  checkedInToday: boolean;
  lastSurveyAt: string | null;
  surveyCompleted: boolean;
  pendingRequests: number;
  lastActiveAt: string | null;
}

export interface ManagerDashboard {
  summary: { assignedEmployees: number; pendingBreakRequests: number; pendingDiscussionRequests: number; upcomingMeetings: number };
  recentRequests: SupportRequest[];
  upcomingMeetings: Meeting[];
  recentActivity: { kind: 'REQUEST' | 'CHECK_IN' | 'SURVEY'; at: string; employeeName: string; description: string }[];
}

export interface ManagerWithTeam {
  id: number;
  fullName: string;
  employeeId: string;
  isActive: boolean;
  department: string | null;
  designation: string | null;
  team: { id: number; fullName: string; employeeId: string; department: string | null; designation: string | null; assignedAt: string }[];
}

export interface AnalyticsSummary {
  totalEmployees: number;
  totalLineManagers: number;
  todaysAssessments: number;
  surveySubmissions: number;
  surveySubmissionsThisCycle: number;
  pendingRequests: number;
  scheduledMeetings: number;
  unassignedEmployees: number;
}

export interface DailyTrend {
  date: string;
  assessments: number;
  surveys: number;
  breakRequests: number;
  discussionRequests: number;
  activity: number;
  activeUsers: number;
  respondents: number;
  avgMood: number | null;
  avgStress: number | null;
  avgEnergy: number | null;
}

export interface Trends {
  days: number;
  timezone: string;
  minGroupSize: number;
  daily: DailyTrend[];
  weekly: { weekStart: string; assessments: number; participants: number }[];
  requestStatus: { type: RequestType; status: RequestStatus; count: number }[];
  departments: {
    department: string;
    employees: number;
    respondents: number;
    checkIns: number;
    mood: number | null;
    stress: number | null;
    energy: number | null;
  }[];
}

export interface SurveyAnalytics {
  frequencyDays: number;
  minGroupSize: number;
  participation: { eligible: number; completed: number; pending: number; rate: number };
  questions: { id: number; text: string; category: string; isActive: boolean; respondents: number; average: number | null; distribution: number[] | null }[];
}

export interface AppSetting {
  key: string;
  value: string;
  label: string;
  description: string;
  updatedAt: string;
  updatedByName: string | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actorId: number | null;
  actorName: string | null;
}
