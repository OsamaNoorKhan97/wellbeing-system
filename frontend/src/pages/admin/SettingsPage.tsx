import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, ConfirmDialog, ErrorState, Field, PageHeader, PageLoader, inputClass } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { settingsService } from '../../services';

type Values = Record<string, string>;
const limitChoices = [
  { value: '1', label: 'Once per day' },
  { value: '2', label: 'Twice per day' },
  { value: '3', label: 'Three times per day' },
];

export function SettingsPage() {
  const toast = useToast();
  const { data, error, reload } = useFetch(() => settingsService.list(), []);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Values>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((setting) => [setting.key, setting.value])));
  }, [data]);

  const saved: Values = Object.fromEntries((data ?? []).map((setting) => [setting.key, setting.value]));
  const changed = Object.keys(values).filter((key) => values[key] !== saved[key]);
  const meta = (key: string) => data?.find((setting) => setting.key === key);
  const set = (key: string) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const customLimit = !limitChoices.some((choice) => choice.value === values.daily_assessment_limit);

  const review = (event: FormEvent) => {
    event.preventDefault();
    const next: Values = {};
    const whole = (key: string, min: number, max: number) => {
      const number = Number(values[key]);
      if (!/^\d+$/.test(values[key] ?? '') || number < min || number > max) next[key] = `Enter a whole number from ${min} to ${max}`;
    };
    whole('daily_assessment_limit', 1, 10);
    whole('survey_frequency_days', 1, 365);
    whole('analytics_min_group_size', 1, 50);
    if (!values.organization_timezone?.trim()) next.organization_timezone = 'Time zone is required';
    setErrors(next);
    if (Object.keys(next).length === 0) setConfirming(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await settingsService.update(Object.fromEntries(changed.map((key) => [key, values[key].trim()])));
      toast.success('Settings saved. They apply immediately.');
      reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'VALIDATION_ERROR') setErrors(caught.fieldErrors);
      else toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  const updatedNote = (key: string) => {
    const setting = meta(key);
    return setting?.updatedByName ? `Last changed by ${setting.updatedByName} on ${formatDateTime(setting.updatedAt)}` : undefined;
  };

  return (
    <>
      <PageHeader title="Application Settings" description="Organization-wide rules. Changes take effect immediately for all users." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || Object.keys(values).length === 0 ? (
        <PageLoader />
      ) : (
        <form onSubmit={review} noValidate className="max-w-3xl space-y-6">
          <Card title="Daily Assessment Limit" description="How many times an employee can submit the well-being check in one day">
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Daily assessment limit">
              {limitChoices.map((choice) => {
                const selected = values.daily_assessment_limit === choice.value;
                return (
                  <label
                    key={choice.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${
                      selected ? 'border-brand-600 bg-brand-50 font-medium text-brand-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input type="radio" name="daily-limit" className="h-4 w-4 accent-brand-700" checked={selected} onChange={() => set('daily_assessment_limit')(choice.value)} />
                    {choice.label}
                  </label>
                );
              })}
            </div>
            <div className="mt-4 max-w-xs">
              <Field label="Or a custom number per day (1–10)" error={errors.daily_assessment_limit} hint={updatedNote('daily_assessment_limit')}>
                {(props) => (
                  <input {...props} className={inputClass(errors.daily_assessment_limit)} inputMode="numeric" value={customLimit ? values.daily_assessment_limit : ''} placeholder={customLimit ? '' : 'e.g. 4'} onChange={(e) => set('daily_assessment_limit')(e.target.value)} />
                )}
              </Field>
            </div>
            <div className="mt-4">
              <Alert tone="info">This limit controls well-being check-in submissions only. It does not restrict how often employees can sign in.</Alert>
            </div>
          </Card>

          <Card title="Survey and reporting">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Survey frequency (days)" error={errors.survey_frequency_days} hint={updatedNote('survey_frequency_days') ?? meta('survey_frequency_days')?.description}>
                {(props) => <input {...props} className={inputClass(errors.survey_frequency_days)} inputMode="numeric" value={values.survey_frequency_days ?? ''} onChange={(e) => set('survey_frequency_days')(e.target.value)} />}
              </Field>
              <Field label="Minimum group size for averages" error={errors.analytics_min_group_size} hint={updatedNote('analytics_min_group_size') ?? meta('analytics_min_group_size')?.description}>
                {(props) => <input {...props} className={inputClass(errors.analytics_min_group_size)} inputMode="numeric" value={values.analytics_min_group_size ?? ''} onChange={(e) => set('analytics_min_group_size')(e.target.value)} />}
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Organization time zone"
                  error={errors.organization_timezone}
                  hint={updatedNote('organization_timezone') ?? 'IANA name, for example Asia/Karachi or Europe/London. Defines when the day starts for the daily limit and for reports.'}
                >
                  {(props) => <input {...props} className={inputClass(errors.organization_timezone)} value={values.organization_timezone ?? ''} onChange={(e) => set('organization_timezone')(e.target.value)} />}
                </Field>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {changed.length > 0 && (
              <Button variant="ghost" onClick={() => { setValues(saved); setErrors({}); }}>
                Discard changes
              </Button>
            )}
            <Button type="submit" disabled={changed.length === 0}>
              Save settings
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirming}
        title="Save settings?"
        message={
          <>
            <p>These changes apply to everyone immediately:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {changed.map((key) => (
                <li key={key}>
                  {meta(key)?.label}: <span className="text-slate-400 line-through">{saved[key]}</span> → <span className="font-medium text-ink">{values[key]}</span>
                </li>
              ))}
            </ul>
          </>
        }
        confirmLabel="Save"
        loading={saving}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
