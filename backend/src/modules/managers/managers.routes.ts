import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/pool';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { getSettings } from '../../services/settings.service';
import { asyncHandler, ok } from '../../utils/http';
import { listMeetings } from '../meetings/meetings.service';
import { listRequests } from '../requests/requests.service';

const TEAM = 'SELECT employee_id FROM employee_manager_assignments WHERE manager_id = $1 AND is_active';

/**
 * What a Line Manager sees about a team member: identity and activity
 * (when they last checked in, whether the survey is done), never the ratings themselves.
 */
async function listTeam(managerId: number, search?: string) {
  const { timezone, surveyFrequencyDays } = await getSettings();
  const params: unknown[] = [managerId, timezone, surveyFrequencyDays];
  let searchSql = '';
  if (search) {
    params.push(`%${search}%`);
    searchSql = `AND (e.full_name ILIKE $4 OR e.employee_code ILIKE $4 OR ep.department ILIKE $4)`;
  }
  const { rows } = await db.query(
    `SELECT e.id, e.full_name AS "fullName", e.employee_code AS "employeeId", e.email,
            ep.department, ep.designation, e.is_active AS "isActive", a.assigned_at AS "assignedAt",
            c.last_at AS "lastCheckInAt",
            COALESCE((c.last_at AT TIME ZONE $2::text)::date = (now() AT TIME ZONE $2::text)::date, false) AS "checkedInToday",
            s.last_at AS "lastSurveyAt",
            COALESCE(s.last_at + make_interval(days => $3) > now(), false) AS "surveyCompleted",
            (SELECT count(*)::int FROM support_requests sr
              WHERE sr.employee_id = e.id AND sr.manager_id = $1 AND sr.status = 'PENDING') AS "pendingRequests",
            GREATEST(e.last_login_at, c.last_at, s.last_at) AS "lastActiveAt"
       FROM employee_manager_assignments a
       JOIN users e ON e.id = a.employee_id
       LEFT JOIN employee_profiles ep ON ep.user_id = e.id
       LEFT JOIN LATERAL (SELECT max(submitted_at) AS last_at FROM wellbeing_assessments w WHERE w.employee_id = e.id) c ON true
       LEFT JOIN LATERAL (SELECT max(submitted_at) AS last_at FROM survey_submissions ss WHERE ss.employee_id = e.id) s ON true
      WHERE a.manager_id = $1 AND a.is_active ${searchSql}
      ORDER BY e.full_name`,
    params,
  );
  return rows;
}

async function recentTeamActivity(managerId: number) {
  const { rows } = await db.query(
    `SELECT kind, at, "employeeName", description FROM (
        SELECT 'REQUEST' AS kind, sr.created_at AS at, e.full_name AS "employeeName",
               CASE sr.type WHEN 'BREAK' THEN 'requested a break' ELSE 'requested a discussion' END AS description
          FROM support_requests sr JOIN users e ON e.id = sr.employee_id
         WHERE sr.manager_id = $1
        UNION ALL
        SELECT 'CHECK_IN', w.submitted_at, e.full_name, 'completed a well-being check-in'
          FROM wellbeing_assessments w JOIN users e ON e.id = w.employee_id
         WHERE w.employee_id IN (${TEAM})
        UNION ALL
        SELECT 'SURVEY', s.submitted_at, e.full_name, 'completed the Organizational Behavior survey'
          FROM survey_submissions s JOIN users e ON e.id = s.employee_id
         WHERE s.employee_id IN (${TEAM})
     ) activity ORDER BY at DESC LIMIT 10`,
    [managerId],
  );
  return rows;
}

export const managersRouter = Router();
managersRouter.use(authenticate, authorize('LINE_MANAGER'));

managersRouter.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const [counts, requests, meetings, activity] = await Promise.all([
      db.query(
        `SELECT (SELECT count(*)::int FROM employee_manager_assignments WHERE manager_id = $1 AND is_active) AS "assignedEmployees",
                (SELECT count(*)::int FROM support_requests WHERE manager_id = $1 AND type = 'BREAK' AND status = 'PENDING') AS "pendingBreakRequests",
                (SELECT count(*)::int FROM support_requests WHERE manager_id = $1 AND type = 'DISCUSSION' AND status = 'PENDING') AS "pendingDiscussionRequests",
                (SELECT count(*)::int FROM meetings WHERE manager_id = $1 AND status = 'SCHEDULED' AND scheduled_at >= now()) AS "upcomingMeetings"`,
        [user.id],
      ),
      listRequests(user, { page: 1, pageSize: 5 }),
      listMeetings(user, { page: 1, pageSize: 5, scope: 'upcoming' }),
      recentTeamActivity(user.id),
    ]);
    ok(res, { summary: counts.rows[0], recentRequests: requests.items, upcomingMeetings: meetings.items, recentActivity: activity });
  }),
);

managersRouter.get(
  '/me/team',
  validate({ query: z.object({ search: z.string().trim().max(100).optional() }) }),
  asyncHandler(async (req, res) => ok(res, await listTeam(currentUser(req).id, res.locals.query.search || undefined))),
);
