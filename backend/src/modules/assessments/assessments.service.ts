import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { recordAudit } from '../../services/audit.service';
import { getSettings } from '../../services/settings.service';
import { AppError, offsetOf } from '../../utils/http';

const ASSESSMENT_COLUMNS = `id, mood_rating AS mood, stress_rating AS stress, energy_rating AS energy, submitted_at AS "submittedAt"`;

export interface AssessmentStatus {
  limit: number;
  usedToday: number;
  remaining: number;
  canSubmit: boolean;
  nextAvailableAt: Date | null;
  timezone: string;
  latestToday: { id: number; mood: number; stress: number; energy: number; submittedAt: Date } | null;
}

/** "Today" is the current calendar day in the organization's time zone, not the server's. */
export async function getAssessmentStatus(employeeId: number, tx: Db = db): Promise<AssessmentStatus> {
  const settings = await getSettings(tx);
  const { rows } = await tx.query(
    `SELECT count(*)::int AS used,
            ((date_trunc('day', now() AT TIME ZONE $2::text) + interval '1 day') AT TIME ZONE $2::text) AS "nextReset"
       FROM wellbeing_assessments
      WHERE employee_id = $1
        AND (submitted_at AT TIME ZONE $2::text)::date = (now() AT TIME ZONE $2::text)::date`,
    [employeeId, settings.timezone],
  );
  const latest = await tx.query(
    `SELECT ${ASSESSMENT_COLUMNS} FROM wellbeing_assessments
      WHERE employee_id = $1 AND (submitted_at AT TIME ZONE $2::text)::date = (now() AT TIME ZONE $2::text)::date
      ORDER BY submitted_at DESC LIMIT 1`,
    [employeeId, settings.timezone],
  );
  const used: number = rows[0].used;
  const remaining = Math.max(0, settings.dailyAssessmentLimit - used);
  return {
    limit: settings.dailyAssessmentLimit,
    usedToday: used,
    remaining,
    canSubmit: remaining > 0,
    nextAvailableAt: remaining > 0 ? null : rows[0].nextReset,
    timezone: settings.timezone,
    latestToday: latest.rows[0] ?? null,
  };
}

export async function submitAssessment(
  employee: AuthUser,
  ratings: { mood: number; stress: number; energy: number },
  ip: string | null,
) {
  return withTransaction(async (tx) => {
    // Serializes concurrent submissions by the same employee so the limit cannot be exceeded by a double click.
    await tx.query('SELECT pg_advisory_xact_lock(1001, $1)', [employee.id]);
    const status = await getAssessmentStatus(employee.id, tx);
    if (!status.canSubmit) {
      throw new AppError(
        429,
        'DAILY_LIMIT_REACHED',
        `You have reached today's limit of ${status.limit} well-being check-in${status.limit === 1 ? '' : 's'}.`,
        { limit: status.limit, usedToday: status.usedToday, nextAvailableAt: status.nextAvailableAt, timezone: status.timezone },
      );
    }
    const { rows } = await tx.query(
      `INSERT INTO wellbeing_assessments (employee_id, mood_rating, stress_rating, energy_rating)
       VALUES ($1, $2, $3, $4) RETURNING ${ASSESSMENT_COLUMNS}`,
      [employee.id, ratings.mood, ratings.stress, ratings.energy],
    );
    await recordAudit(tx, { actorId: employee.id, action: 'ASSESSMENT_SUBMITTED', entityType: 'wellbeing_assessment', entityId: rows[0].id, ip });
    return { assessment: rows[0], status: await getAssessmentStatus(employee.id, tx) };
  });
}

export async function listOwnAssessments(employeeId: number, page: number, pageSize: number) {
  const total = await db.query('SELECT count(*)::int AS total FROM wellbeing_assessments WHERE employee_id = $1', [employeeId]);
  const { rows } = await db.query(
    `SELECT ${ASSESSMENT_COLUMNS} FROM wellbeing_assessments WHERE employee_id = $1
      ORDER BY submitted_at DESC LIMIT $2 OFFSET $3`,
    [employeeId, pageSize, offsetOf(page, pageSize)],
  );
  return { items: rows, total: total.rows[0].total as number };
}
