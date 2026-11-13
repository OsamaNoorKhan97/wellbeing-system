import { z } from 'zod';
import { db, type Db } from '../db/pool';

export const settingDefinitions = {
  daily_assessment_limit: { label: 'Daily assessment limit', schema: z.coerce.number().int().min(1).max(10) },
  survey_frequency_days: { label: 'Survey frequency (days)', schema: z.coerce.number().int().min(1).max(365) },
  organization_timezone: { label: 'Organization time zone', schema: z.string().trim().min(1).max(64) },
  analytics_min_group_size: { label: 'Minimum group size for analytics', schema: z.coerce.number().int().min(1).max(50) },
} as const;

export type SettingKey = keyof typeof settingDefinitions;

export interface AppSettings {
  dailyAssessmentLimit: number;
  surveyFrequencyDays: number;
  timezone: string;
  minGroupSize: number;
}

/** Read on every use rather than cached, so a change by HR applies to the very next request. */
export async function getSettings(tx: Db = db): Promise<AppSettings> {
  const { rows } = await tx.query('SELECT key, value FROM application_settings');
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  return {
    dailyAssessmentLimit: Number(values.daily_assessment_limit ?? 1),
    surveyFrequencyDays: Number(values.survey_frequency_days ?? 30),
    timezone: values.organization_timezone ?? 'UTC',
    minGroupSize: Number(values.analytics_min_group_size ?? 3),
  };
}
