import { routeForNotification } from '../src/lib/links';
import { describeHours, formatDate, initials, requestTone, roleHome, timeAgo } from '../src/lib/format';
import { isActiveMeeting } from '../src/types';

describe('deep links from notifications', () => {
  it('opens the alert for managers and HR, but not for employees', () => {
    expect(routeForNotification({ entityType: 'wellbeing_alert', entityId: 7 }, 'LINE_MANAGER')).toBe('/alert/7');
    expect(routeForNotification({ entityType: 'wellbeing_alert', entityId: 7 }, 'HR')).toBe('/alert/7');
    expect(routeForNotification({ entityType: 'wellbeing_alert', entityId: 7 }, 'EMPLOYEE')).toBe('/(tabs)');
  });
  it('opens requests and meetings by id', () => {
    expect(routeForNotification({ entityType: 'support_request', entityId: '12' }, 'EMPLOYEE')).toBe('/request/12');
    expect(routeForNotification({ entityType: 'meeting', entityId: 3 }, 'LINE_MANAGER')).toBe('/meeting/3');
  });
  it('falls back to null (open the app) when there is no usable target', () => {
    expect(routeForNotification({ entityType: null, entityId: null }, 'HR')).toBeNull();
    expect(routeForNotification({ entityType: 'support_request', entityId: null }, 'HR')).toBeNull();
    expect(routeForNotification({ entityType: 'unknown', entityId: 1 }, 'HR')).toBeNull();
  });
});

describe('formatting', () => {
  it('describes the configured interval in plain words', () => {
    expect(describeHours(24)).toBe('24 hours');
    expect(describeHours(48)).toBe('2 days');
    expect(describeHours(12)).toBe('12 hours');
    expect(describeHours(1)).toBe('1 hour');
    expect(describeHours(36)).toBe('36 hours');
  });
  it('shows relative times', () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    expect(timeAgo('2026-11-22T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-22T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-11-22T06:00:00Z', now)).toBe('6 h ago');
    expect(timeAgo('2026-11-20T12:00:00Z', now)).toBe('2 d ago');
  });
  it('handles empty dates and initials', () => {
    expect(formatDate(null)).toBe('—');
    expect(initials('Rana Salman Anwar')).toBe('RS');
    expect(initials('Aiman')).toBe('A');
  });
  it('maps statuses to tones and roles to a home screen', () => {
    expect(requestTone('PENDING')).toBe('warning');
    expect(requestTone('REJECTED')).toBe('danger');
    expect(roleHome.SUPER_ADMIN).toBe('/(tabs)');
  });
  it('treats only scheduled and rescheduled meetings as active', () => {
    expect(isActiveMeeting('SCHEDULED')).toBe(true);
    expect(isActiveMeeting('RESCHEDULED')).toBe(true);
    for (const s of ['REJECTED', 'CANCELLED', 'COMPLETED'] as const) expect(isActiveMeeting(s)).toBe(false);
  });
});
