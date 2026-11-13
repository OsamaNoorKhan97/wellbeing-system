import type { MeetingStatus, RequestStatus, Role } from '../types';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const formatDate = (value: string | Date | null | undefined) => (value ? dateFormat.format(new Date(value)) : '—');
export const formatTime = (value: string | Date) => timeFormat.format(new Date(value));
export const formatDateTime = (value: string | Date | null | undefined) => (value ? `${formatDate(value)}, ${formatTime(value)}` : '—');
export const formatWeekday = (value: string | Date) => weekdayFormat.format(new Date(value));

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

/** "2026-11-12" (a calendar day from the API) as "12 Nov" without shifting it across time zones. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(year, month - 1, date));
}

export const roleLabels: Record<Role, string> = { EMPLOYEE: 'Employee', LINE_MANAGER: 'Line Manager', HR_ADMIN: 'HR / Admin' };
export const roleHome: Record<Role, string> = { EMPLOYEE: '/employee', LINE_MANAGER: '/manager', HR_ADMIN: '/admin' };

export const requestStatusLabels: Record<RequestStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Meeting scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Withdrawn',
};
export const meetingStatusLabels: Record<MeetingStatus, string> = { SCHEDULED: 'Scheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const humanize = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Values for <input type="date"> and <input type="time"> in the browser's local time. */
export function toLocalInputs(value: string | Date): { date: string; time: string } {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export const fromLocalInputs = (date: string, time: string) => new Date(`${date}T${time}`);
