import { pool } from './pool';

/** Removes all user-generated data and restores the default settings and survey questions. Used by the seed script and the tests. */
export async function resetData(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of [
      'audit_logs',
      'notifications',
      'meetings',
      'wellbeing_alerts',
      'support_requests',
      'survey_responses',
      'survey_submissions',
      'wellbeing_assessments',
      'employee_manager_assignments',
      'password_reset_tokens',
    ]) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query('DELETE FROM survey_questions WHERE created_by IS NOT NULL');
    await client.query('UPDATE survey_questions SET is_active = true WHERE NOT is_active');
    await client.query('DELETE FROM users');
    await client.query(
      `UPDATE application_settings s SET value = d.value, updated_by = NULL
         FROM (VALUES ('assessment_interval_hours', '24'), ('survey_frequency_days', '30'),
                      ('organization_timezone', 'Asia/Karachi'), ('analytics_min_group_size', '3'),
                      ('alert_mood_threshold', '2'), ('alert_stress_threshold', '4'), ('alert_energy_threshold', '2'),
                      ('alert_indicators_required', '2'), ('alert_consecutive_required', '2'),
                      ('alert_notify_line_manager', 'true'), ('alert_notify_hr', 'true')) AS d(key, value)
        WHERE s.key = d.key AND s.value <> d.value`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
