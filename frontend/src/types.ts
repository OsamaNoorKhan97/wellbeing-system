export type Role = 'EMPLOYEE' | 'LINE_MANAGER' | 'HR' | 'SUPER_ADMIN';

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
  /** Hours between two assessments, set by the Super Admin. */
  intervalHours: number;
  canSubmit: boolean;
  nextAvailableAt: string | null;
  lastSubmittedAt: string | null;
  timezone: string;
  latest: Assessment | null;
}

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface WellbeingAlert {
  id: number;
  status: AlertStatus;
  alertType: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  department: string | null;
  managerId: number | null;
  managerName: string | null;
  acknowledgedByName: string | null;
  resolvedByName: string | null;
  assessmentCount: number;
  assessmentDates: string[];
  commentCount: number;
  breakRequest: { id: number; status: RequestStatus } | null;
}

export interface AlertComment {
  id: number;
  comment: string;
  createdAt: string;
  authorId: number | null;
  authorName: string | null;
  authorRole: Role | null;
}

export interface WellbeingAlertDetail extends WellbeingAlert {
  comments: AlertComment[];
}

/** The supportive "take a break" suggestion shown to an employee while a well-being alert is open. */
export interface BreakRecommendation {
  alertId: number;
  triggeredAt: string;
  request: { id: number; status: RequestStatus; managerComment: string | null } | null;
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
  alertId: number | null;
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

export type MeetingStatus = 'SCHEDULED' | 'RESCHEDULED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

/** A meeting that can still take place. */
export const isActiveMeeting = (status: MeetingStatus) => status === 'SCHEDULED' || status === 'RESCHEDULED';

export interface MeetingHistoryEntry {
  id: number;
  action: 'RESCHEDULED' | 'REJECTED' | 'SNOOZED' | 'REMINDER_SENT';
  previousScheduledAt: string | null;
  newScheduledAt: string | null;
  previousDurationMinutes: number | null;
  snoozedUntil: string | null;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
}

export interface Meeting {
  id: number;
  requestId: number | null;
  scheduledAt: string;
  durationMinutes: number;
  purpose: string | null;
  location: string | null;
  status: MeetingStatus;
  cancellationReason: string | null;
  rejectionReason: string | null;
  rescheduleCount: number;
  /** The manager's reminder is postponed until this time. The meeting itself is unaffected. */
  snoozedUntil: string | null;
  snoozeCount: number;
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
  breakRecommendation: BreakRecommendation | null;
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
  summary: {
    assignedEmployees: number;
    pendingBreakRequests: number;
    pendingDiscussionRequests: number;
    upcomingMeetings: number;
    activeAlerts: number;
  };
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
  openAlerts: number;
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
