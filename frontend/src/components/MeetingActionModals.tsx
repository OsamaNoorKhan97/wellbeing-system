import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useFetch';
import { errorMessage } from '../lib/api';
import { formatDate, formatDateTime, formatTime, fromLocalInputs, toLocalInputs } from '../lib/format';
import { meetingService } from '../services';
import type { Meeting } from '../types';
import { Alert, Button, ErrorState, Field, Modal, PageLoader, inputClass } from './ui';

interface BaseProps {
  meeting: Meeting | null;
  onClose: () => void;
  onDone: () => void;
}

const when = (meeting: Meeting) => `${formatDate(meeting.scheduledAt)} at ${formatTime(meeting.scheduledAt)}`;

/** Confirmation with an optional reason before a meeting is rejected. */
export function RejectMeetingModal({ meeting, onClose, onDone }: BaseProps) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meeting) {
      setReason('');
      setError(null);
    }
  }, [meeting]);

  const reject = async () => {
    if (!meeting) return;
    setBusy(true);
    setError(null);
    try {
      await meetingService.reject(meeting.id, reason.trim());
      toast.success(`Meeting rejected. ${meeting.employeeName} has been notified.`);
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={meeting !== null}
      title="Reject meeting"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep meeting
          </Button>
          <Button variant="danger" onClick={reject} loading={busy}>
            Reject meeting
          </Button>
        </>
      }
    >
      {meeting && (
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-sm text-slate-600">
            Reject the meeting with <span className="font-medium text-ink">{meeting.employeeName}</span> on {when(meeting)}? Its status will change to Rejected and the employee will be notified.
            {meeting.requestId ? ' Their discussion request will return to your pending list.' : ''}
          </p>
          <Field label="Reason for rejecting" hint="Optional. Included in the notification to the employee.">
            {(props) => <textarea {...props} className="input min-h-20" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </div>
      )}
    </Modal>
  );
}

/** Shows the current schedule, asks for a new one and keeps the old details in the meeting history. */
export function RescheduleMeetingModal({ meeting, onClose, onDone }: BaseProps) {
  const toast = useToast();
  const [form, setForm] = useState({ date: '', time: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (meeting) {
      // Start from the current schedule so the manager only changes what needs changing.
      setForm({ ...toLocalInputs(meeting.scheduledAt), reason: '' });
      setErrors({});
      setFormError(null);
    }
  }, [meeting]);

  const save = async () => {
    if (!meeting) return;
    const next: Record<string, string> = {};
    if (!form.date) next.date = 'Select a new date';
    if (!form.time) next.time = 'Select a new time';
    const target = form.date && form.time ? fromLocalInputs(form.date, form.time) : null;
    if (target && target.getTime() <= Date.now()) next.date = 'Choose a date and time in the future';
    if (target && Math.abs(target.getTime() - new Date(meeting.scheduledAt).getTime()) < 60_000) next.date = 'Choose a different date or time from the current one';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || !target) return;

    setBusy(true);
    try {
      await meetingService.reschedule(meeting.id, { scheduledAt: target.toISOString(), reason: form.reason.trim() || null });
      toast.success(`Meeting rescheduled. ${meeting.employeeName} has been notified.`);
      onDone();
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={meeting !== null}
      title="Reschedule meeting"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Reschedule and notify
          </Button>
        </>
      }
    >
      {meeting && (
        <div className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs text-slate-500">Current schedule with {meeting.employeeName}</p>
            <p className="font-medium text-ink">
              {formatDate(meeting.scheduledAt)}, {formatTime(meeting.scheduledAt)} · {meeting.durationMinutes} min
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New date" error={errors.date} required>
              {(props) => (
                <input {...props} type="date" className={inputClass(errors.date)} min={toLocalInputs(new Date()).date} value={form.date} onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))} />
              )}
            </Field>
            <Field label="New time" error={errors.time} required>
              {(props) => <input {...props} type="time" className={inputClass(errors.time)} value={form.time} onChange={(e) => setForm((c) => ({ ...c, time: e.target.value }))} />}
            </Field>
          </div>
          <Field label="Reason for rescheduling" hint="Optional. Included in the notification to the employee.">
            {(props) => <textarea {...props} className="input min-h-20" maxLength={500} value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} />}
          </Field>
          <p className="text-xs text-slate-500">The previous date and time are kept in the meeting history.</p>
        </div>
      )}
    </Modal>
  );
}

const snoozeChoices = [
  { id: '60', label: '1 hour', minutes: 60 },
  { id: '180', label: '3 hours', minutes: 180 },
  { id: '1440', label: '1 day', minutes: 1440 },
  { id: 'custom', label: 'Custom date and time', minutes: 0 },
];

/** Postpones the manager's reminder only; the meeting itself is not changed. */
export function SnoozeMeetingModal({ meeting, onClose, onDone }: BaseProps) {
  const toast = useToast();
  const [choice, setChoice] = useState('60');
  const [custom, setCustom] = useState({ date: '', time: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (meeting) {
      const tomorrow = new Date(Date.now() + 24 * 3_600_000);
      tomorrow.setHours(9, 0, 0, 0);
      setChoice('60');
      setCustom(toLocalInputs(tomorrow));
      setError(null);
    }
  }, [meeting]);

  const snooze = async () => {
    if (!meeting) return;
    setError(null);
    let input: { minutes: number } | { until: string };
    if (choice === 'custom') {
      const until = custom.date && custom.time ? fromLocalInputs(custom.date, custom.time) : null;
      if (!until) return setError('Select a date and time for the reminder.');
      if (until.getTime() <= Date.now()) return setError('Choose a reminder time in the future.');
      input = { until: until.toISOString() };
    } else {
      input = { minutes: snoozeChoices.find((c) => c.id === choice)!.minutes };
    }
    setBusy(true);
    try {
      const updated = await meetingService.snooze(meeting.id, input);
      toast.success(`Reminder snoozed until ${formatDateTime(updated.data.snoozedUntil)}. The meeting time has not changed.`);
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={meeting !== null}
      title="Snooze meeting reminder"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={snooze} loading={busy}>
            Snooze reminder
          </Button>
        </>
      }
    >
      {meeting && (
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Alert tone="info">
            Only your reminder is postponed. The meeting with {meeting.employeeName} stays on <span className="font-medium">{when(meeting)}</span>, and they are not notified.
          </Alert>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Remind me again in</legend>
            <div className="grid gap-2">
              {snoozeChoices.map((item) => (
                <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${choice === item.id ? 'border-brand-600 bg-brand-50 font-medium text-brand-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <input type="radio" name="snooze" className="h-4 w-4 accent-brand-700" checked={choice === item.id} onChange={() => setChoice(item.id)} />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          {choice === 'custom' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reminder date">
                {(props) => <input {...props} type="date" className="input" min={toLocalInputs(new Date()).date} value={custom.date} onChange={(e) => setCustom((c) => ({ ...c, date: e.target.value }))} />}
              </Field>
              <Field label="Reminder time">
                {(props) => <input {...props} type="time" className="input" value={custom.time} onChange={(e) => setCustom((c) => ({ ...c, time: e.target.value }))} />}
              </Field>
            </div>
          )}
          {meeting.snoozedUntil && <p className="text-xs text-slate-500">Currently snoozed until {formatDateTime(meeting.snoozedUntil)}.</p>}
        </div>
      )}
    </Modal>
  );
}

const actionLabels = { RESCHEDULED: 'Rescheduled', REJECTED: 'Rejected', SNOOZED: 'Reminder snoozed', REMINDER_SENT: 'Reminder sent' } as const;

/** Every reschedule, the rejection and the reminder snoozes of one meeting, oldest first. */
export function MeetingHistoryModal({ meeting, onClose }: Pick<BaseProps, 'meeting' | 'onClose'>) {
  const { data, error, reload } = useFetch(() => (meeting ? meetingService.history(meeting.id) : Promise.reject(new Error('No meeting'))), [meeting?.id]);
  return (
    <Modal open={meeting !== null} title="Meeting history" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {meeting &&
        (error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <PageLoader />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Meeting with <span className="font-medium text-ink">{meeting.employeeName}</span>, now on {when(meeting)}.
            </p>
            {data.length === 0 ? (
              <p className="text-sm text-slate-500">This meeting has not been changed.</p>
            ) : (
              <ol className="space-y-3">
                {data.map((entry) => (
                  <li key={entry.id} className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                    <p className="font-medium text-ink">{actionLabels[entry.action]}</p>
                    {entry.action === 'RESCHEDULED' && (
                      <p className="text-slate-600">
                        {formatDateTime(entry.previousScheduledAt)} → {formatDateTime(entry.newScheduledAt)}
                      </p>
                    )}
                    {entry.action === 'REJECTED' && entry.previousScheduledAt && <p className="text-slate-600">Was planned for {formatDateTime(entry.previousScheduledAt)}</p>}
                    {entry.action === 'SNOOZED' && <p className="text-slate-600">Reminder postponed until {formatDateTime(entry.snoozedUntil)}</p>}
                    {entry.reason && <p className="text-slate-600">Reason: {entry.reason}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.actorName ?? 'System'} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
    </Modal>
  );
}
