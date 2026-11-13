import { FiCalendar, FiCoffee, FiMapPin, FiMessageSquare } from 'react-icons/fi';
import { formatDateTime, formatTime, formatWeekday } from '../lib/format';
import type { Meeting, RequestType, SupportRequest } from '../types';

export function RequestTypeLabel({ type }: { type: RequestType }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium whitespace-nowrap text-ink">
      <span className={`flex h-7 w-7 items-center justify-center rounded-md ${type === 'BREAK' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'}`} aria-hidden>
        {type === 'BREAK' ? <FiCoffee /> : <FiMessageSquare />}
      </span>
      {type === 'BREAK' ? 'Break' : 'Discussion'}
    </span>
  );
}

/** The outcome of a request in one line: manager comment for breaks, meeting details for discussions. */
export function RequestOutcome({ request }: { request: SupportRequest }) {
  if (request.meetingAt) {
    return (
      <span className="text-sm text-slate-600">
        Meeting on <span className="font-medium text-ink">{formatDateTime(request.meetingAt)}</span>
        {request.meetingPurpose ? ` · ${request.meetingPurpose}` : ''}
      </span>
    );
  }
  if (request.managerComment) return <span className="text-sm text-slate-600">“{request.managerComment}”</span>;
  return <span className="text-sm text-slate-400">—</span>;
}

export function MeetingItem({ meeting, counterpart }: { meeting: Meeting; counterpart: 'manager' | 'employee' }) {
  const date = new Date(meeting.scheduledAt);
  return (
    <div className="flex gap-3">
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 text-brand-800">
        <span className="text-[10px] font-semibold uppercase">{date.toLocaleString(undefined, { month: 'short' })}</span>
        <span className="text-lg leading-none font-semibold">{date.getDate()}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{meeting.purpose || 'Discussion'}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <FiCalendar aria-hidden />
            {formatWeekday(meeting.scheduledAt)}, {formatTime(meeting.scheduledAt)} · {meeting.durationMinutes} min
          </span>
          {meeting.location && (
            <span className="inline-flex items-center gap-1">
              <FiMapPin aria-hidden />
              {meeting.location}
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">with {counterpart === 'manager' ? meeting.managerName : meeting.employeeName}</p>
      </div>
    </div>
  );
}
