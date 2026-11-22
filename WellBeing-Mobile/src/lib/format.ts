import type { AlertStatus, MeetingStatus, RequestStatus, Role } from '../types';

export const roleLabels: Record<Role, string> = {
  EMPLOYEE: 'Employee',
  LINE_MANAGER: 'Line Manager',
  HR: 'HR',
  SUPER_ADMIN: 'Super Admin',
};

/** Where each role lands after signing in. */
export const roleHome: Record<Role, string> = {
  EMPLOYEE: '/(tabs)',
  LINE_MANAGER: '/(tabs)',
  HR: '/(tabs)',
  SUPER_ADMIN: '/(tabs)',
};

export const requestStatusLabels: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const meetingStatusLabels: Record<MeetingStatus, string> = {
  SCHEDULED: 'Scheduled',
  RESCHEDULED: 'Rescheduled',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export const alertStatusLabels: Record<AlertStatus, string> = {
  ACTIVE: 'Needs attention',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
};

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const requestTone = (s: RequestStatus): Tone =>
  ({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', SCHEDULED: 'info', COMPLETED: 'success', CANCELLED: 'neutral' })[s] as Tone;
export const meetingTone = (s: MeetingStatus): Tone =>
  ({ SCHEDULED: 'info', RESCHEDULED: 'warning', REJECTED: 'danger', CANCELLED: 'neutral', COMPLETED: 'success' })[s] as Tone;
export const alertTone = (s: AlertStatus): Tone => ({ ACTIVE: 'danger', ACKNOWLEDGED: 'warning', RESOLVED: 'success' })[s] as Tone;

const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, dateOptions) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(undefined, timeOptions) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? `${formatDate(iso)}, ${formatTime(iso)}` : '—');

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(iso);
}

/** "24 hours" / "2 days" / "36 hours" for the configured assessment interval. */
export function describeHours(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '24 hours' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const moodEmojis = ['😞', '🙁', '😐', '🙂', '😄'];
export const energyEmojis = ['🪫', '😴', '😐', '⚡', '🔋'];
export const stressEmojis = ['😌', '🙂', '😐', '😟', '😫'];
export const moodLabels = ['Very low', 'Low', 'Okay', 'Good', 'Great'];
export const stressLabels = ['Very calm', 'Calm', 'Moderate', 'Tense', 'Very stressed'];
export const energyLabels = ['Drained', 'Tired', 'Okay', 'Energetic', 'Very energetic'];

export const surveyChoices = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' },
];
