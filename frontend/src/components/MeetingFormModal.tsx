import { useEffect, useState } from 'react';
import { ApiError, errorMessage } from '../lib/api';
import { fromLocalInputs, toLocalInputs } from '../lib/format';
import type { MeetingInput } from '../services';
import { Alert, Button, Field, Modal, inputClass } from './ui';

export interface MeetingFormValues extends MeetingInput {
  employeeId?: number;
}

interface Props {
  open: boolean;
  title: string;
  submitLabel: string;
  /** When provided, the form asks which employee the meeting is with. */
  employees?: { id: number; fullName: string; employeeId: string }[];
  /** Shown instead of the employee selector when the employee is fixed. */
  employeeName?: string;
  initial?: Partial<MeetingInput>;
  onSubmit: (values: MeetingFormValues) => Promise<void>;
  onClose: () => void;
}

const durations = [15, 30, 45, 60, 90];

function defaults(initial?: Partial<MeetingInput>) {
  const start = initial?.scheduledAt ? new Date(initial.scheduledAt) : new Date(Date.now() + 24 * 3_600_000);
  if (!initial?.scheduledAt) start.setHours(10, 0, 0, 0);
  return {
    ...toLocalInputs(start),
    employeeId: '',
    durationMinutes: String(initial?.durationMinutes ?? 30),
    location: initial?.location ?? '',
    purpose: initial?.purpose ?? '',
  };
}

export function MeetingFormModal({ open, title, submitLabel, employees, employeeName, initial, onSubmit, onClose }: Props) {
  const [form, setForm] = useState(() => defaults(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(defaults(initial));
      setErrors({});
      setFormError(null);
    }
    // Reset only when the dialog opens; `initial` is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    const next: Record<string, string> = {};
    if (employees && !form.employeeId) next.employeeId = 'Select an employee';
    if (!form.date) next.date = 'Select a date';
    if (!form.time) next.time = 'Select a time';
    const when = form.date && form.time ? fromLocalInputs(form.date, form.time) : null;
    if (when && when.getTime() <= Date.now()) next.date = 'Choose a date and time in the future';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || !when) return;

    setSubmitting(true);
    try {
      await onSubmit({
        employeeId: employees ? Number(form.employeeId) : undefined,
        scheduledAt: when.toISOString(),
        durationMinutes: Number(form.durationMinutes),
        location: form.location.trim() || null,
        purpose: form.purpose.trim() || null,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors({ ...error.fieldErrors, date: error.fieldErrors.scheduledAt ?? '' });
      else setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        {employees ? (
          <Field label="Employee" error={errors.employeeId} required>
            {(props) => (
              <select {...props} className={inputClass(errors.employeeId)} value={form.employeeId} onChange={set('employeeId')}>
                <option value="">Select a team member…</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} ({employee.employeeId})
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : employeeName ? (
          <p className="text-sm text-slate-600">
            Meeting with <span className="font-medium text-ink">{employeeName}</span>. They will be notified with the details below.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Meeting date" error={errors.date} required>
            {(props) => <input {...props} type="date" className={inputClass(errors.date)} value={form.date} min={toLocalInputs(new Date()).date} onChange={set('date')} />}
          </Field>
          <Field label="Meeting time" error={errors.time} required>
            {(props) => <input {...props} type="time" className={inputClass(errors.time)} value={form.time} onChange={set('time')} />}
          </Field>
          <Field label="Duration" error={errors.durationMinutes}>
            {(props) => (
              <select {...props} className="input" value={form.durationMinutes} onChange={set('durationMinutes')}>
                {[...new Set([...durations, Number(form.durationMinutes)])].sort((a, b) => a - b).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Location or link" error={errors.location}>
          {(props) => <input {...props} className="input" value={form.location} maxLength={200} onChange={set('location')} placeholder="Meeting Room B, or a video call link" />}
        </Field>
        <Field label="Notes / purpose" error={errors.purpose} hint="Optional. Included in the employee's notification.">
          {(props) => <textarea {...props} className="input min-h-20" value={form.purpose} maxLength={1000} onChange={set('purpose')} />}
        </Field>
      </div>
    </Modal>
  );
}
