import { z } from 'zod';
import { db, type Db } from '../db/pool';

const boolean = z.preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean());
const rating = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number` }).int().min(1, `${label} must be between 1 and 5`).max(5, `${label} must be between 1 and 5`);

/**
 * Every global setting. All of them are changed through the Super Admin configuration screen;
 * they are read from the database on every use, so a change applies without a redeploy.
 */
export const settingDefinitions = {
  assessment_interval_hours: {
    label: 'Well-being assessment interval (hours)',
    schema: z.coerce.number().int().min(1, 'Use at least 1 hour').max(24 * 90, 'Use at most 2160 hours (90 days)'),
  },
  survey_frequency_days: { label: 'Survey frequency (days)', schema: z.coerce.number().int().min(1, 'Use at least 1 day').max(365, 'Use at most 365 days') },
  organization_timezone: { label: 'Organization time zone', schema: z.string().trim().min(1).max(64) },
  analytics_min_group_size: { label: 'Minimum group size for analytics', schema: z.coerce.number().int().min(1).max(50) },
  alert_mood_threshold: { label: 'Mood: poor at or below', schema: rating('Mood threshold') },
  alert_stress_threshold: { label: 'Stress: poor at or above', schema: rating('Stress threshold') },
  alert_energy_threshold: { label: 'Energy: poor at or below', schema: rating('Energy threshold') },
  alert_indicators_required: {
    label: 'Poor indicators required per assessment',
    schema: z.coerce.number().int().min(1, 'Choose 1, 2 or 3').max(3, 'Choose 1, 2 or 3'),
  },
  alert_consecutive_required: {
    label: 'Consecutive poor assessments that trigger an alert',
    schema: z.coerce.number().int().min(1, 'Use at least 1').max(10, 'Use at most 10'),
  },
  alert_notify_line_manager: { label: 'Notify the Line Manager about alerts', schema: boolean },
  alert_notify_hr: { label: 'Notify HR about alerts', schema: boolean },
} as const;

export type SettingKey = keyof typeof settingDefinitions;

export interface AppSettings {
  assessmentIntervalHours: number;
  surveyFrequencyDays: number;
  timezone: string;
  minGroupSize: number;
  alertMoodThreshold: number;
  alertStressThreshold: number;
  alertEnergyThreshold: number;
  alertIndicatorsRequired: number;
  alertConsecutiveRequired: number;
  alertNotifyLineManager: boolean;
  alertNotifyHr: boolean;
}

/** Read on every use rather than cached, so a change by the Super Admin applies to the very next request. */
export async function getSettings(tx: Db = db): Promise<AppSettings> {
  const { rows } = await tx.query('SELECT key, value FROM application_settings');
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  return {
    assessmentIntervalHours: Number(values.assessment_interval_hours ?? 24),
    surveyFrequencyDays: Number(values.survey_frequency_days ?? 30),
    timezone: values.organization_timezone ?? 'UTC',
    minGroupSize: Number(values.analytics_min_group_size ?? 3),
    alertMoodThreshold: Number(values.alert_mood_threshold ?? 2),
    alertStressThreshold: Number(values.alert_stress_threshold ?? 4),
    alertEnergyThreshold: Number(values.alert_energy_threshold ?? 2),
    alertIndicatorsRequired: Number(values.alert_indicators_required ?? 2),
    alertConsecutiveRequired: Number(values.alert_consecutive_required ?? 2),
    alertNotifyLineManager: (values.alert_notify_line_manager ?? 'true') === 'true',
    alertNotifyHr: (values.alert_notify_hr ?? 'true') === 'true',
  };
}
