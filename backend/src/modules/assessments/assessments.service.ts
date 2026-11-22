import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { recordAudit } from '../../services/audit.service';
import { getSettings } from '../../services/settings.service';
import { formatMeetingTime } from '../../utils/dates';
import { AppError, offsetOf } from '../../utils/http';
import { evaluateAlertAfterAssessment, getBreakRecommendation } from '../alerts/alerts.service';

const ASSESSMENT_COLUMNS = `id, mood_rating AS mood, stress_rating AS stress, energy_rating AS energy, submitted_at AS "submittedAt"`;

export interface AssessmentStatus {
  /** Hours the employee must wait between two assessments (a global setting). */
  intervalHours: number;
  canSubmit: boolean;
  /** When the next assessment becomes possible; null while the employee is eligible now. */
  nextAvailableAt: Date | null;
  lastSubmittedAt: Date | null;
  timezone: string;
  latest: { id: number; mood: number; stress: number; energy: number; submittedAt: Date } | null;
}

/**
 * An employee is eligible once the configured interval has passed since their latest assessment.
 * The interval is read from the database on every call, so a change by the Super Admin applies immediately.
 */
export async function getAssessmentStatus(employeeId: number, tx: Db = db): Promise<AssessmentStatus> {
  const settings = await getSettings(tx);
  const { rows } = await tx.query(
    `SELECT ${ASSESSMENT_COLUMNS},
            submitted_at + make_interval(hours => $2) AS "nextAvailableAt",
            submitted_at + make_interval(hours => $2) <= now() AS eligible
       FROM wellbeing_assessments WHERE employee_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT 1`,
    [employeeId, settings.assessmentIntervalHours],
  );
  const latest = rows[0];
  const canSubmit = !latest || latest.eligible;
  return {
    intervalHours: settings.assessmentIntervalHours,
    canSubmit,
    nextAvailableAt: canSubmit ? null : latest.nextAvailableAt,
    lastSubmittedAt: latest?.submittedAt ?? null,
    timezone: settings.timezone,
    latest: latest ? { id: latest.id, mood: latest.mood, stress: latest.stress, energy: latest.energy, submittedAt: latest.submittedAt } : null,
  };
}

export async function submitAssessment(
  employee: AuthUser,
  ratings: { mood: number; stress: number; energy: number },
  ip: string | null,
) {
  return withTransaction(async (tx) => {
    // Serializes concurrent submissions by the same employee so the interval cannot be bypassed by a double click.
    await tx.query('SELECT pg_advisory_xact_lock(1001, $1)', [employee.id]);
    const status = await getAssessmentStatus(employee.id, tx);
    if (!status.canSubmit) {
      throw new AppError(
        429,
        'ASSESSMENT_NOT_YET_AVAILABLE',
        `Your next well-being check-in is not available yet. You can submit again after ${formatMeetingTime(status.nextAvailableAt!, status.timezone).date} at ${formatMeetingTime(status.nextAvailableAt!, status.timezone).time}.`,
        { intervalHours: status.intervalHours, nextAvailableAt: status.nextAvailableAt, timezone: status.timezone },
      );
    }
    const { rows } = await tx.query(
      `INSERT INTO wellbeing_assessments (employee_id, mood_rating, stress_rating, energy_rating)
       VALUES ($1, $2, $3, $4) RETURNING ${ASSESSMENT_COLUMNS}`,
      [employee.id, ratings.mood, ratings.stress, ratings.energy],
    );
    await recordAudit(tx, { actorId: employee.id, action: 'ASSESSMENT_SUBMITTED', entityType: 'wellbeing_assessment', entityId: rows[0].id, ip });
    // The alert rule runs after every successful submission, in the same transaction.
    const alertId = await evaluateAlertAfterAssessment(tx, employee);
    return {
      assessment: rows[0],
      status: await getAssessmentStatus(employee.id, tx),
      recommendation: alertId ? await getBreakRecommendation(employee.id, tx) : null,
    };
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
