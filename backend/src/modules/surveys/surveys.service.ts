import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { recordAudit } from '../../services/audit.service';
import { getSettings } from '../../services/settings.service';
import { AppError, conflict, notFound, offsetOf } from '../../utils/http';

const QUESTION_COLUMNS = `id, question_text AS text, category, display_order AS "displayOrder", is_active AS "isActive",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function listQuestions(includeInactive: boolean, tx: Db = db) {
  const { rows } = await tx.query(
    `SELECT ${QUESTION_COLUMNS} FROM survey_questions ${includeInactive ? '' : 'WHERE is_active'} ORDER BY display_order, id`,
  );
  return rows;
}

export interface QuestionInput {
  text: string;
  category: string;
  displayOrder?: number;
  isActive?: boolean;
}

export async function createQuestion(actor: AuthUser, input: QuestionInput, ip: string | null) {
  const { rows } = await db.query(
    `INSERT INTO survey_questions (question_text, category, display_order, is_active, created_by)
     VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(max(display_order), 0) + 1 FROM survey_questions)), $4, $5)
     RETURNING ${QUESTION_COLUMNS}`,
    [input.text, input.category, input.displayOrder ?? null, input.isActive ?? true, actor.id],
  );
  await recordAudit(db, { actorId: actor.id, action: 'SURVEY_QUESTION_CREATED', entityType: 'survey_question', entityId: rows[0].id, ip });
  return rows[0];
}

export async function updateQuestion(actor: AuthUser, id: number, input: Partial<QuestionInput>, ip: string | null) {
  const { rows } = await db.query(
    `UPDATE survey_questions
        SET question_text = COALESCE($2, question_text),
            category = COALESCE($3, category),
            display_order = COALESCE($4, display_order),
            is_active = COALESCE($5, is_active)
      WHERE id = $1 RETURNING ${QUESTION_COLUMNS}`,
    [id, input.text ?? null, input.category ?? null, input.displayOrder ?? null, input.isActive ?? null],
  );
  if (rows.length === 0) throw notFound('Survey question');
  const action =
    input.isActive === undefined ? 'SURVEY_QUESTION_UPDATED' : input.isActive ? 'SURVEY_QUESTION_ACTIVATED' : 'SURVEY_QUESTION_DEACTIVATED';
  await recordAudit(db, { actorId: actor.id, action, entityType: 'survey_question', entityId: id, ip });
  return rows[0];
}

export async function getSurveyStatus(employeeId: number, tx: Db = db) {
  const settings = await getSettings(tx);
  const { rows } = await tx.query(
    `SELECT s.submitted_at AS "lastSubmittedAt",
            s.submitted_at + make_interval(days => $2) AS "nextAvailableAt",
            s.submitted_at + make_interval(days => $2) > now() AS completed
       FROM survey_submissions s WHERE s.employee_id = $1 ORDER BY s.submitted_at DESC LIMIT 1`,
    [employeeId, settings.surveyFrequencyDays],
  );
  const active = await tx.query('SELECT count(*)::int AS total FROM survey_questions WHERE is_active');
  const last = rows[0];
  return {
    completed: Boolean(last?.completed),
    lastSubmittedAt: last?.lastSubmittedAt ?? null,
    nextAvailableAt: last?.completed ? last.nextAvailableAt : null,
    frequencyDays: settings.surveyFrequencyDays,
    activeQuestionCount: active.rows[0].total as number,
  };
}

export async function submitSurvey(employee: AuthUser, answers: { questionId: number; rating: number }[], ip: string | null) {
  return withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(1002, $1)', [employee.id]);
    const status = await getSurveyStatus(employee.id, tx);
    if (status.completed) {
      throw conflict('SURVEY_ALREADY_COMPLETED', 'You have already completed the current survey.', { nextAvailableAt: status.nextAvailableAt });
    }

    const questions = await listQuestions(false, tx);
    if (questions.length === 0) throw conflict('SURVEY_UNAVAILABLE', 'The survey has no active questions at the moment.');
    const activeIds = new Set<number>(questions.map((q) => q.id));
    const answered = new Map<number, number>();
    for (const answer of answers) if (activeIds.has(answer.questionId)) answered.set(answer.questionId, answer.rating);

    const missing = questions.filter((q) => !answered.has(q.id));
    if (missing.length > 0) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'Please answer every question before submitting',
        missing.map((q) => ({ field: `question_${q.id}`, questionId: q.id, message: 'This question requires an answer' })),
      );
    }

    const submission = await tx.query(
      'INSERT INTO survey_submissions (employee_id) VALUES ($1) RETURNING id, submitted_at AS "submittedAt"',
      [employee.id],
    );
    const submissionId: number = submission.rows[0].id;
    const ids = [...answered.keys()];
    await tx.query(
      `INSERT INTO survey_responses (submission_id, question_id, rating)
       SELECT $1, q, r FROM unnest($2::int[], $3::int[]) AS t(q, r)`,
      [submissionId, ids, ids.map((id) => answered.get(id))],
    );
    await recordAudit(tx, { actorId: employee.id, action: 'SURVEY_SUBMITTED', entityType: 'survey_submission', entityId: submissionId, ip });
    return { submission: submission.rows[0], status: await getSurveyStatus(employee.id, tx) };
  });
}

export async function listOwnSubmissions(employeeId: number, page: number, pageSize: number) {
  const total = await db.query('SELECT count(*)::int AS total FROM survey_submissions WHERE employee_id = $1', [employeeId]);
  const { rows } = await db.query(
    `SELECT s.id, s.submitted_at AS "submittedAt",
            json_agg(json_build_object('questionId', q.id, 'text', q.question_text, 'category', q.category, 'rating', r.rating)
                     ORDER BY q.display_order, q.id) AS responses
       FROM survey_submissions s
       JOIN survey_responses r ON r.submission_id = s.id
       JOIN survey_questions q ON q.id = r.question_id
      WHERE s.employee_id = $1
      GROUP BY s.id
      ORDER BY s.submitted_at DESC LIMIT $2 OFFSET $3`,
    [employeeId, pageSize, offsetOf(page, pageSize)],
  );
  return { items: rows, total: total.rows[0].total as number };
}
