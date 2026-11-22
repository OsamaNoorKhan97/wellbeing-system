import '../config/env';
import type { AuthUser, Role } from '../middleware/authenticate';
import { assignManager } from '../modules/assignments/assignments.service';
import { createRequest, decideBreakRequest, scheduleDiscussion } from '../modules/requests/requests.service';
import { scheduleMeeting } from '../modules/meetings/meetings.service';
import { insertUser } from '../modules/users/users.service';
import { getSettings } from '../services/settings.service';
import { runMigrations } from './migrate';
import { closePool, db, withTransaction } from './pool';
import { resetData } from './reset';

const PASSWORD = process.env.SEED_PASSWORD || 'Password@123';

interface SeedUser {
  code: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  designation?: string;
  manager?: string;
}

const USERS: SeedUser[] = [
  { code: 'SUPER001', name: 'Rana Salman Anwar', email: 'super.admin@example.com', role: 'SUPER_ADMIN' },
  { code: 'HR001', name: 'Ayesha Khan', email: 'hr.admin@example.com', role: 'HR' },
  { code: 'MGR001', name: 'Osama Noor Khan', email: 'bilal.ahmed@example.com', role: 'LINE_MANAGER', department: 'Engineering', designation: 'Engineering Manager' },
  { code: 'MGR002', name: 'Aiman Fatima', email: 'sara.malik@example.com', role: 'LINE_MANAGER', department: 'Sales & Marketing', designation: 'Head of Sales' },
  { code: 'MGR003', name: 'Hamza Khan', email: 'omar.farooq@example.com', role: 'LINE_MANAGER', department: 'Operations', designation: 'Operations Manager' },
  { code: 'MGR004', name: 'Hammad Rafi', email: 'hammad.rafi@example.com', role: 'LINE_MANAGER', department: 'Finance', designation: 'Finance Manager' },
  { code: 'EMP001', name: 'Hassan Raza', email: 'hassan.raza@example.com', role: 'EMPLOYEE', department: 'Engineering', designation: 'Software Engineer', manager: 'MGR001' },
  { code: 'EMP002', name: 'Fatima Noor', email: 'fatima.noor@example.com', role: 'EMPLOYEE', department: 'Engineering', designation: 'QA Engineer', manager: 'MGR001' },
  { code: 'EMP003', name: 'Usman Tariq', email: 'usman.tariq@example.com', role: 'EMPLOYEE', department: 'Engineering', designation: 'Senior Software Engineer', manager: 'MGR001' },
  { code: 'EMP004', name: 'Zainab Hussain', email: 'zainab.hussain@example.com', role: 'EMPLOYEE', department: 'Engineering', designation: 'UI/UX Designer', manager: 'MGR001' },
  { code: 'EMP005', name: 'Ali Sheikh', email: 'ali.sheikh@example.com', role: 'EMPLOYEE', department: 'Engineering', designation: 'DevOps Engineer', manager: 'MGR001' },
  { code: 'EMP006', name: 'Maryam Iqbal', email: 'maryam.iqbal@example.com', role: 'EMPLOYEE', department: 'Sales & Marketing', designation: 'Account Executive', manager: 'MGR002' },
  { code: 'EMP007', name: 'Hamza Siddiqui', email: 'hamza.siddiqui@example.com', role: 'EMPLOYEE', department: 'Sales & Marketing', designation: 'Marketing Specialist', manager: 'MGR002' },
  { code: 'EMP008', name: 'Sana Javed', email: 'sana.javed@example.com', role: 'EMPLOYEE', department: 'Sales & Marketing', designation: 'Sales Associate', manager: 'MGR002' },
  { code: 'EMP009', name: 'Imran Qureshi', email: 'imran.qureshi@example.com', role: 'EMPLOYEE', department: 'Sales & Marketing', designation: 'Content Strategist', manager: 'MGR002' },
  { code: 'EMP010', name: 'Nadia Aslam', email: 'nadia.aslam@example.com', role: 'EMPLOYEE', department: 'Operations', designation: 'Operations Analyst', manager: 'MGR003' },
  { code: 'EMP011', name: 'Kamran Butt', email: 'kamran.butt@example.com', role: 'EMPLOYEE', department: 'Operations', designation: 'Logistics Coordinator', manager: 'MGR003' },
  { code: 'EMP012', name: 'Hira Baig', email: 'hira.baig@example.com', role: 'EMPLOYEE', department: 'Operations', designation: 'Support Specialist', manager: 'MGR003' },
  { code: 'EMP013', name: 'Danish Mirza', email: 'danish.mirza@example.com', role: 'EMPLOYEE', department: 'Finance', designation: 'Financial Analyst' },
];

/** Deterministic pseudo-random numbers so every seed run produces the same sample data. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const daysFromNow = (days: number, hour: number, minute = 0) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
};

async function seed() {
  await runMigrations((m) => console.log(m));

  const existing = await db.query('SELECT count(*)::int AS total FROM users');
  if (existing.rows[0].total > 0) {
    if (!process.argv.includes('--reset')) {
      console.log('The database already contains users. Run "npm run db:reset" to wipe it and load the sample data again.');
      return;
    }
    await resetData();
    console.log('Existing data removed.');
  }

  const ids = new Map<string, number>();
  const actors = new Map<string, AuthUser>();
  for (const user of USERS) {
    const id = await withTransaction((tx) =>
      insertUser(tx, {
        fullName: user.name,
        employeeId: user.code,
        email: user.email,
        password: PASSWORD,
        role: user.role,
        department: user.department,
        designation: user.designation,
      }),
    );
    ids.set(user.code, id);
    actors.set(user.code, { id, role: user.role, fullName: user.name, email: user.email });
  }
  const admin = actors.get('HR001')!;
  const actor = (code: string) => actors.get(code)!;

  for (const user of USERS) {
    if (user.manager) await assignManager(admin, ids.get(user.code)!, ids.get(user.manager)!, null);
  }

  // Thirty days of check-ins. Each employee has a personal baseline so the charts show believable variation.
  const random = createRandom(20261112);
  const { timezone } = await getSettings();
  const employees = USERS.filter((u) => u.role === 'EMPLOYEE');
  const rows: { employee: number; day: number; minute: number; mood: number; stress: number; energy: number }[] = [];
  const clamp = (value: number) => Math.min(5, Math.max(1, Math.round(value)));
  employees.forEach((employee, index) => {
    const baseline = 3 + (index % 4) * 0.4;
    for (let day = 30; day >= 0; day -= 1) {
      // The first sample employee has no recent check-in (nothing today or yesterday), so the form can be tried straight away.
      if (index === 0 && day <= 1) continue;
      if (day === 0 && random() < 0.4) continue;
      if (day > 0 && random() < 0.25) continue;
      const mood = clamp(baseline + (random() - 0.5) * 2.4);
      rows.push({
        employee: ids.get(employee.code)!,
        day,
        minute: day === 0 ? -1 : 9 * 60 + Math.floor(random() * 8 * 60),
        mood,
        stress: clamp(6 - mood + (random() - 0.5) * 2),
        energy: clamp(mood + (random() - 0.5) * 1.6),
      });
    }
  });
  await db.query(
    `WITH inserted AS (
       INSERT INTO wellbeing_assessments (employee_id, mood_rating, stress_rating, energy_rating, submitted_at)
       SELECT e, m, s, n,
              CASE WHEN mi < 0 THEN now() - interval '5 minutes'
                   ELSE (date_trunc('day', now() AT TIME ZONE $7::text) - make_interval(days => d) + make_interval(mins => mi)) AT TIME ZONE $7::text
              END
         FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[]) AS t(e, d, mi, m, s, n)
       RETURNING id, employee_id, submitted_at
     )
     INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, created_at)
     SELECT employee_id, 'ASSESSMENT_SUBMITTED', 'wellbeing_assessment', id, submitted_at FROM inserted`,
    [rows.map((r) => r.employee), rows.map((r) => r.day), rows.map((r) => r.minute), rows.map((r) => r.mood), rows.map((r) => r.stress), rows.map((r) => r.energy), timezone],
  );
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, created_at)
     SELECT employee_id, 'LOGIN', 'user', employee_id, submitted_at - interval '3 minutes' FROM wellbeing_assessments`,
  );

  // Survey answers for most employees, spread over the last three weeks.
  const questions = (await db.query('SELECT id FROM survey_questions WHERE is_active ORDER BY display_order')).rows.map((r) => r.id as number);
  for (const [index, employee] of employees.entries()) {
    if (index === 0 || index % 4 === 3) continue;
    const baseline = 3 + (index % 3) * 0.5;
    const submission = await db.query(
      `INSERT INTO survey_submissions (employee_id, submitted_at) VALUES ($1, now() - make_interval(days => $2, hours => $3)) RETURNING id, submitted_at`,
      [ids.get(employee.code), 1 + Math.floor(random() * 20), Math.floor(random() * 8)],
    );
    await db.query(
      `INSERT INTO survey_responses (submission_id, question_id, rating) SELECT $1, q, r FROM unnest($2::int[], $3::int[]) AS t(q, r)`,
      [submission.rows[0].id, questions, questions.map(() => clamp(baseline + (random() - 0.5) * 2.6))],
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, created_at) VALUES ($1, 'SURVEY_SUBMITTED', 'survey_submission', $2, $3)`,
      [ids.get(employee.code), submission.rows[0].id, submission.rows[0].submitted_at],
    );
  }

  // Support requests in every state, created through the same services the API uses so notifications and audit entries exist too.
  const approved = await createRequest(actor('EMP003'), 'BREAK', 'Long release weekend, would like a short break this afternoon.', null);
  await decideBreakRequest(actor('MGR001'), approved.id, true, 'Well deserved. Take the afternoon.', null);
  const rejected = await createRequest(actor('EMP006'), 'BREAK', 'Feeling tired after the client event.', null);
  await decideBreakRequest(actor('MGR002'), rejected.id, false, 'Client demo at 3 PM today. Please take it tomorrow morning instead.', null);
  await createRequest(actor('EMP002'), 'BREAK', 'Headache after back-to-back test cycles.', null);
  await createRequest(actor('EMP004'), 'DISCUSSION', 'I would like to talk about my workload for the next sprint.', null);
  await createRequest(actor('EMP010'), 'BREAK', null, null);
  await createRequest(actor('EMP007'), 'DISCUSSION', 'Career growth conversation.', null);

  const discussion = await createRequest(actor('EMP001'), 'DISCUSSION', 'Would like feedback on my recent project and next steps.', null);
  await scheduleDiscussion(
    actor('MGR001'),
    discussion.id,
    { scheduledAt: daysFromNow(2, 6, 30), durationMinutes: 30, purpose: 'Project feedback and growth plan', location: 'Meeting Room B' },
    null,
  );
  await scheduleMeeting(
    actor('MGR001'),
    ids.get('EMP005')!,
    { scheduledAt: daysFromNow(4, 9, 0), durationMinutes: 45, purpose: 'Quarterly one-to-one', location: 'Video call' },
    null,
  );
  await scheduleMeeting(
    actor('MGR003'),
    ids.get('EMP011')!,
    { scheduledAt: daysFromNow(3, 5, 0), durationMinutes: 30, purpose: 'Shift planning check-in', location: 'Operations office' },
    null,
  );
  // Spread the sample requests over the past two weeks so the trend charts are not a single spike.
  await db.query(`UPDATE support_requests SET created_at = created_at - make_interval(days => (id * 2) % 13)`);

  console.log(`\nSample data loaded: ${USERS.length} users, ${rows.length} check-ins.`);
  console.log(`All sample accounts use the password: ${PASSWORD}`);
  console.log('  Super Admin   super.admin@example.com  (SUPER001)');
  console.log('  HR            hr.admin@example.com     (HR001)');
  console.log('  Line Manager  bilal.ahmed@example.com  (MGR001)');
  console.log('  Employee      hassan.raza@example.com  (EMP001)');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);
