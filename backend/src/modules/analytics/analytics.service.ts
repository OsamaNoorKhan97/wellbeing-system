import { db } from '../../db/pool';
import { getSettings } from '../../services/settings.service';

const dayOf = (column: string) => `(${column} AT TIME ZONE $1::text)::date`;
const TODAY = `(now() AT TIME ZONE $1::text)::date`;
const ACTIVE_EMPLOYEES = `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'EMPLOYEE' AND u.is_active`;

export async function getSummary() {
  const { timezone, surveyFrequencyDays } = await getSettings();
  const { rows } = await db.query(
    `SELECT (SELECT count(*)::int FROM (${ACTIVE_EMPLOYEES}) e) AS "totalEmployees",
            (SELECT count(*)::int FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'LINE_MANAGER' AND u.is_active) AS "totalLineManagers",
            (SELECT count(*)::int FROM wellbeing_assessments WHERE ${dayOf('submitted_at')} = ${TODAY}) AS "todaysAssessments",
            (SELECT count(*)::int FROM survey_submissions) AS "surveySubmissions",
            (SELECT count(DISTINCT employee_id)::int FROM survey_submissions
              WHERE submitted_at > now() - make_interval(days => $2)) AS "surveySubmissionsThisCycle",
            (SELECT count(*)::int FROM support_requests WHERE status = 'PENDING') AS "pendingRequests",
            (SELECT count(*)::int FROM meetings WHERE status = 'SCHEDULED' AND scheduled_at >= now()) AS "scheduledMeetings",
            (SELECT count(*)::int FROM (${ACTIVE_EMPLOYEES}) e
              WHERE NOT EXISTS (SELECT 1 FROM employee_manager_assignments a WHERE a.employee_id = e.id AND a.is_active)) AS "unassignedEmployees"`,
    [timezone, surveyFrequencyDays],
  );
  return rows[0];
}

/** Per-day counts for the charts, plus organization-wide averages that are withheld for small groups. */
export async function getTrends(days: number) {
  const { timezone, minGroupSize } = await getSettings();
  const daily = await db.query(
    `WITH days AS (
       SELECT generate_series(${TODAY} - ($2::int - 1), ${TODAY}, interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            (SELECT count(*)::int FROM wellbeing_assessments w WHERE ${dayOf('w.submitted_at')} = d.day) AS assessments,
            (SELECT count(*)::int FROM survey_submissions s WHERE ${dayOf('s.submitted_at')} = d.day) AS surveys,
            (SELECT count(*)::int FROM support_requests r WHERE r.type = 'BREAK' AND ${dayOf('r.created_at')} = d.day) AS "breakRequests",
            (SELECT count(*)::int FROM support_requests r WHERE r.type = 'DISCUSSION' AND ${dayOf('r.created_at')} = d.day) AS "discussionRequests",
            (SELECT count(*)::int FROM audit_logs l WHERE ${dayOf('l.created_at')} = d.day) AS activity,
            (SELECT count(DISTINCT l.actor_id)::int FROM audit_logs l WHERE ${dayOf('l.created_at')} = d.day) AS "activeUsers"
       FROM days d ORDER BY d.day`,
    [timezone, days],
  );

  const averages = await db.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS date, respondents,
            CASE WHEN respondents >= $3 THEN mood END AS mood,
            CASE WHEN respondents >= $3 THEN stress END AS stress,
            CASE WHEN respondents >= $3 THEN energy END AS energy
       FROM (
         SELECT ${dayOf('submitted_at')} AS day, count(DISTINCT employee_id)::int AS respondents,
                round(avg(mood_rating), 2)::float8 AS mood,
                round(avg(stress_rating), 2)::float8 AS stress,
                round(avg(energy_rating), 2)::float8 AS energy
           FROM wellbeing_assessments
          WHERE ${dayOf('submitted_at')} > ${TODAY} - $2::int
          GROUP BY 1
       ) x ORDER BY day`,
    [timezone, days, minGroupSize],
  );
  const averageByDate = new Map(averages.rows.map((row) => [row.date, row]));

  const weekly = await db.query(
    `WITH weeks AS (
       SELECT generate_series(date_trunc('week', ${TODAY}) - interval '7 weeks', date_trunc('week', ${TODAY}), interval '1 week')::date AS week_start
     )
     SELECT to_char(w.week_start, 'YYYY-MM-DD') AS "weekStart",
            (SELECT count(*)::int FROM wellbeing_assessments a
              WHERE ${dayOf('a.submitted_at')} >= w.week_start AND ${dayOf('a.submitted_at')} < w.week_start + 7) AS assessments,
            (SELECT count(DISTINCT a.employee_id)::int FROM wellbeing_assessments a
              WHERE ${dayOf('a.submitted_at')} >= w.week_start AND ${dayOf('a.submitted_at')} < w.week_start + 7) AS participants
       FROM weeks w ORDER BY w.week_start`,
    [timezone],
  );

  const requestStatus = await db.query(
    `SELECT type, status, count(*)::int AS count FROM support_requests
      WHERE ${dayOf('created_at')} > ${TODAY} - $2::int GROUP BY type, status ORDER BY type, status`,
    [timezone, days],
  );

  const departments = await db.query(
    `SELECT ep.department, count(DISTINCT e.id)::int AS employees,
            count(DISTINCT w.employee_id)::int AS respondents,
            count(w.id)::int AS "checkIns",
            CASE WHEN count(DISTINCT w.employee_id) >= $3 THEN round(avg(w.mood_rating), 2)::float8 END AS mood,
            CASE WHEN count(DISTINCT w.employee_id) >= $3 THEN round(avg(w.stress_rating), 2)::float8 END AS stress,
            CASE WHEN count(DISTINCT w.employee_id) >= $3 THEN round(avg(w.energy_rating), 2)::float8 END AS energy
       FROM (${ACTIVE_EMPLOYEES}) e
       JOIN employee_profiles ep ON ep.user_id = e.id
       LEFT JOIN wellbeing_assessments w ON w.employee_id = e.id AND ${dayOf('w.submitted_at')} > ${TODAY} - $2::int
      GROUP BY ep.department ORDER BY ep.department`,
    [timezone, days, minGroupSize],
  );

  return {
    days,
    timezone,
    minGroupSize,
    daily: daily.rows.map((row) => {
      const average = averageByDate.get(row.date);
      return {
        ...row,
        respondents: average?.respondents ?? 0,
        avgMood: average?.mood ?? null,
        avgStress: average?.stress ?? null,
        avgEnergy: average?.energy ?? null,
      };
    }),
    weekly: weekly.rows,
    requestStatus: requestStatus.rows,
    departments: departments.rows,
  };
}

/** Survey participation in the current cycle and per-question results based on each employee's latest submission. */
export async function getSurveyAnalytics() {
  const { surveyFrequencyDays, minGroupSize } = await getSettings();
  const participation = await db.query(
    `SELECT (SELECT count(*)::int FROM (${ACTIVE_EMPLOYEES}) e) AS eligible,
            (SELECT count(DISTINCT s.employee_id)::int FROM survey_submissions s
              WHERE s.submitted_at > now() - make_interval(days => $1)
                AND s.employee_id IN (${ACTIVE_EMPLOYEES})) AS completed`,
    [surveyFrequencyDays],
  );

  const questions = await db.query(
    `WITH latest AS (
       SELECT DISTINCT ON (employee_id) id FROM survey_submissions ORDER BY employee_id, submitted_at DESC
     )
     SELECT q.id, q.question_text AS text, q.category, q.is_active AS "isActive",
            count(r.id)::int AS respondents,
            CASE WHEN count(r.id) >= $1 THEN round(avg(r.rating), 2)::float8 END AS average,
            CASE WHEN count(r.id) >= $1 THEN json_build_array(
              count(*) FILTER (WHERE r.rating = 1), count(*) FILTER (WHERE r.rating = 2), count(*) FILTER (WHERE r.rating = 3),
              count(*) FILTER (WHERE r.rating = 4), count(*) FILTER (WHERE r.rating = 5)) END AS distribution
       FROM survey_questions q
       LEFT JOIN survey_responses r ON r.question_id = q.id AND r.submission_id IN (SELECT id FROM latest)
      WHERE q.is_active OR r.id IS NOT NULL
      GROUP BY q.id ORDER BY q.display_order, q.id`,
    [minGroupSize],
  );

  const { eligible, completed } = participation.rows[0];
  return {
    frequencyDays: surveyFrequencyDays,
    minGroupSize,
    participation: { eligible, completed, pending: Math.max(0, eligible - completed), rate: eligible ? Math.round((completed / eligible) * 100) : 0 },
    questions: questions.rows,
  };
}
