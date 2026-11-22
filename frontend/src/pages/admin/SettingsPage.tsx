import { useEffect, useState, type ReactNode } from 'react';
import { FiLock } from 'react-icons/fi';
import { Alert, Button, Card, ErrorState, Field, PageHeader, PageLoader, inputClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { describeHours, formatDateTime } from '../../lib/format';
import { settingsService } from '../../services';

type Values = Record<string, string>;
type Notice = { section: string; tone: 'success' | 'error'; text: string } | null;

const assessmentPresets = [
  { value: '12', label: 'Every 12 hours' },
  { value: '24', label: 'Every 24 hours (default)' },
  { value: '48', label: 'Every 48 hours' },
  { value: '72', label: 'Every 72 hours' },
];
const surveyPresets = [
  { value: '7', label: 'Every 7 days' },
  { value: '15', label: 'Every 15 days' },
  { value: '30', label: 'Every 30 days (default)' },
  { value: '45', label: 'Every 45 days' },
  { value: '60', label: 'Every 60 days' },
];
const ratingChoices = ['1', '2', '3', '4', '5'];

const SECTIONS = {
  assessment: ['assessment_interval_hours'],
  survey: ['survey_frequency_days'],
  alerts: [
    'alert_mood_threshold', 'alert_stress_threshold', 'alert_energy_threshold', 'alert_indicators_required',
    'alert_consecutive_required', 'alert_notify_line_manager', 'alert_notify_hr',
  ],
  reporting: ['analytics_min_group_size', 'organization_timezone'],
} as const;
type SectionName = keyof typeof SECTIONS;

const whole = (value: string | undefined, min: number, max: number, what: string) =>
  /^\d+$/.test(value ?? '') && Number(value) >= min && Number(value) <= max ? undefined : `${what}: enter a whole number from ${min} to ${max}`;

function validate(section: SectionName, values: Values): Values {
  const errors: Values = {};
  const check = (key: string, message: string | undefined) => message && (errors[key] = message);
  if (section === 'assessment') check('assessment_interval_hours', whole(values.assessment_interval_hours, 1, 2160, 'Hours'));
  if (section === 'survey') check('survey_frequency_days', whole(values.survey_frequency_days, 1, 365, 'Days'));
  if (section === 'alerts') {
    for (const key of ['alert_mood_threshold', 'alert_stress_threshold', 'alert_energy_threshold']) check(key, whole(values[key], 1, 5, 'Rating'));
    check('alert_indicators_required', whole(values.alert_indicators_required, 1, 3, 'Indicators'));
    check('alert_consecutive_required', whole(values.alert_consecutive_required, 1, 10, 'Assessments'));
  }
  if (section === 'reporting') {
    check('analytics_min_group_size', whole(values.analytics_min_group_size, 1, 50, 'Group size'));
    if (!values.organization_timezone?.trim()) errors.organization_timezone = 'Time zone is required';
  }
  return errors;
}

/** A row of preset choices plus a "Custom" choice that reveals a number input. */
function IntervalPicker({
  name, value, presets, unit, max, disabled, error, hint, onChange,
}: {
  name: string;
  value: string;
  presets: { value: string; label: string }[];
  unit: 'hours' | 'days';
  max: number;
  disabled: boolean;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const isPreset = presets.some((preset) => preset.value === value);
  const [customChosen, setCustomChosen] = useState(!isPreset);
  useEffect(() => {
    if (!presets.some((preset) => preset.value === value)) setCustomChosen(true);
  }, [value, presets]);
  const custom = customChosen || !isPreset;

  const choice = (selected: boolean, label: string, onSelect: () => void, key: string) => (
    <label
      key={key}
      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
      } ${selected ? 'border-brand-600 bg-brand-50 font-medium text-brand-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
    >
      <input type="radio" name={name} className="h-4 w-4 accent-brand-700" checked={selected} disabled={disabled} onChange={onSelect} />
      {label}
    </label>
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={name}>
        {presets.map((preset) =>
          choice(!custom && value === preset.value, preset.label, () => { setCustomChosen(false); onChange(preset.value); }, preset.value),
        )}
        {choice(custom, 'Custom interval', () => setCustomChosen(true), 'custom')}
      </div>
      {custom && (
        <div className="mt-4 max-w-xs">
          <Field label={`Custom interval (${unit})`} error={error} hint={`Whole number of ${unit}, 1 to ${max}.`}>
            {(props) => (
              <input {...props} className={inputClass(error)} inputMode="numeric" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
            )}
          </Field>
        </div>
      )}
      {!custom && error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {hint && <p className="mt-3 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function RatingSelect({ label, hint, error, value, disabled, onChange }: { label: string; hint: string; error?: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(props) => (
        <select {...props} className={inputClass(error)} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {ratingChoices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN';
  const { data, error, reload } = useFetch(() => settingsService.list(), []);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState<SectionName | null>(null);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((setting) => [setting.key, setting.value])));
  }, [data]);

  const saved: Values = Object.fromEntries((data ?? []).map((setting) => [setting.key, setting.value]));
  const meta = (key: string) => data?.find((setting) => setting.key === key);
  const set = (key: string) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
    setNotice(null);
  };
  const changedIn = (section: SectionName) => SECTIONS[section].filter((key) => values[key] !== saved[key]);
  const lastChange = (section: SectionName) => {
    const rows = SECTIONS[section].map(meta).filter((row) => row?.updatedByName);
    const latest = rows.sort((a, b) => new Date(b!.updatedAt).getTime() - new Date(a!.updatedAt).getTime())[0];
    return latest ? `Last changed by ${latest.updatedByName} on ${formatDateTime(latest.updatedAt)}` : undefined;
  };

  const save = async (section: SectionName) => {
    const found = validate(section, values);
    setErrors((current) => ({ ...current, ...Object.fromEntries(SECTIONS[section].map((key) => [key, found[key] ?? ''])) }));
    if (Object.keys(found).length > 0) {
      setNotice({ section, tone: 'error', text: 'Please correct the highlighted fields. Nothing was saved.' });
      return;
    }
    const changes = changedIn(section);
    if (changes.length === 0) {
      setNotice({ section, tone: 'success', text: 'There are no changes to save.' });
      return;
    }
    setSaving(section);
    try {
      await settingsService.update(Object.fromEntries(changes.map((key) => [key, values[key].trim()])));
      setNotice({ section, tone: 'success', text: 'Settings saved. They apply to everyone immediately, with no restart needed.' });
      reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'VALIDATION_ERROR') {
        setErrors((current) => ({ ...current, ...caught.fieldErrors }));
        setNotice({ section, tone: 'error', text: 'The server rejected some values. Please correct the highlighted fields.' });
      } else {
        setNotice({ section, tone: 'error', text: errorMessage(caught) });
      }
    } finally {
      setSaving(null);
    }
  };

  const sectionFooter = (section: SectionName, label: string) => (
    <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
      {notice?.section === section && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{lastChange(section) ?? 'Using the default values.'}</p>
          <div className="flex gap-2">
            {changedIn(section).length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setValues((current) => ({ ...current, ...Object.fromEntries(SECTIONS[section].map((key) => [key, saved[key]])) }));
                  setErrors({});
                  setNotice(null);
                }}
              >
                Discard changes
              </Button>
            )}
            <Button loading={saving === section} disabled={saving !== null && saving !== section} onClick={() => save(section)}>
              {label}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{lastChange(section) ?? 'Using the default values.'}</p>
      )}
    </div>
  );

  const toggle = (key: string, label: string, hint: string): ReactNode => (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-brand-700"
        checked={values[key] === 'true'}
        disabled={!canEdit}
        onChange={(e) => set(key)(e.target.checked ? 'true' : 'false')}
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );

  const intervalHours = Number(values.assessment_interval_hours);
  return (
    <>
      <PageHeader
        title={canEdit ? 'System Configuration' : 'Application Settings'}
        description={canEdit ? 'Global rules for assessments, surveys and well-being alerts. Changes apply immediately to everyone.' : 'The rules currently in force across the organization.'}
      />
      {!canEdit && (
        <div className="mb-6">
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <FiLock aria-hidden /> These settings are read-only for HR. Only a Super Admin can change them.
            </span>
          </Alert>
        </div>
      )}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || Object.keys(values).length === 0 ? (
        <PageLoader />
      ) : (
        <div className="max-w-4xl space-y-6">
          <Card title="Well-Being Assessment Settings" description="How often an employee can submit the combined mood, stress and energy check-in">
            <IntervalPicker
              name="Assessment frequency"
              value={values.assessment_interval_hours ?? ''}
              presets={assessmentPresets}
              unit="hours"
              max={2160}
              disabled={!canEdit}
              error={errors.assessment_interval_hours}
              hint={
                /^\d+$/.test(values.assessment_interval_hours ?? '') && intervalHours > 0
                  ? `Employees can submit again ${describeHours(intervalHours)} after their previous check-in. Mood, stress and energy are always submitted together.`
                  : undefined
              }
              onChange={set('assessment_interval_hours')}
            />
            {sectionFooter('assessment', 'Save assessment settings')}
          </Card>

          <Card title="Organizational Behavior Survey Settings" description="How often an employee can submit the OB survey. Earlier responses are always kept.">
            <IntervalPicker
              name="Survey frequency"
              value={values.survey_frequency_days ?? ''}
              presets={surveyPresets}
              unit="days"
              max={365}
              disabled={!canEdit}
              error={errors.survey_frequency_days}
              onChange={set('survey_frequency_days')}
            />
            {sectionFooter('survey', 'Save survey settings')}
          </Card>

          <Card title="Well-Being Alert Settings" description="When consecutive check-ins trigger an alert for the Line Manager and HR">
            <div className="grid gap-5 sm:grid-cols-3">
              <RatingSelect
                label="Mood is poor at or below"
                hint="Default 2 (ratings 1 and 2)"
                error={errors.alert_mood_threshold}
                value={values.alert_mood_threshold ?? ''}
                disabled={!canEdit}
                onChange={set('alert_mood_threshold')}
              />
              <RatingSelect
                label="Stress is high at or above"
                hint="Default 4 (ratings 4 and 5)"
                error={errors.alert_stress_threshold}
                value={values.alert_stress_threshold ?? ''}
                disabled={!canEdit}
                onChange={set('alert_stress_threshold')}
              />
              <RatingSelect
                label="Energy is low at or below"
                hint="Default 2 (ratings 1 and 2)"
                error={errors.alert_energy_threshold}
                value={values.alert_energy_threshold ?? ''}
                disabled={!canEdit}
                onChange={set('alert_energy_threshold')}
              />
              <Field label="Poor indicators needed" error={errors.alert_indicators_required} hint="How many of the three must cross their threshold for an assessment to count as poor (default 2)">
                {(props) => (
                  <select {...props} className={inputClass(errors.alert_indicators_required)} value={values.alert_indicators_required ?? ''} disabled={!canEdit} onChange={(e) => set('alert_indicators_required')(e.target.value)}>
                    {['1', '2', '3'].map((choice) => (
                      <option key={choice} value={choice}>
                        {choice} of 3
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Consecutive poor assessments" error={errors.alert_consecutive_required} hint="Poor check-ins in a row that trigger an alert (default 2)">
                {(props) => (
                  <input {...props} className={inputClass(errors.alert_consecutive_required)} inputMode="numeric" disabled={!canEdit} value={values.alert_consecutive_required ?? ''} onChange={(e) => set('alert_consecutive_required')(e.target.value)} />
                )}
              </Field>
            </div>
            <div className="mt-6 space-y-3 rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-semibold text-ink">Alert notifications</p>
              {toggle('alert_notify_line_manager', 'Notify the employee’s Line Manager', 'Sent once when the alert is created.')}
              {toggle('alert_notify_hr', 'Notify HR', 'Every active HR user receives the same alert once.')}
            </div>
            {sectionFooter('alerts', 'Save alert settings')}
          </Card>

          <Card title="Reporting and time zone">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Minimum group size for averages" error={errors.analytics_min_group_size} hint={meta('analytics_min_group_size')?.description}>
                {(props) => (
                  <input {...props} className={inputClass(errors.analytics_min_group_size)} inputMode="numeric" disabled={!canEdit} value={values.analytics_min_group_size ?? ''} onChange={(e) => set('analytics_min_group_size')(e.target.value)} />
                )}
              </Field>
              <Field label="Organization time zone" error={errors.organization_timezone} hint="IANA name, for example Asia/Karachi or Europe/London. Used in dates shown in notifications and reports.">
                {(props) => (
                  <input {...props} className={inputClass(errors.organization_timezone)} disabled={!canEdit} value={values.organization_timezone ?? ''} onChange={(e) => set('organization_timezone')(e.target.value)} />
                )}
              </Field>
            </div>
            {sectionFooter('reporting', 'Save reporting settings')}
          </Card>
        </div>
      )}
    </>
  );
}
