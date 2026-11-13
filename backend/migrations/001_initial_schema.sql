-- Employee Well-Being and Organizational Behavior Monitoring System
-- Initial schema

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE roles (
  id          smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE CHECK (name IN ('EMPLOYEE', 'LINE_MANAGER', 'HR_ADMIN')),
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id       smallint NOT NULL REFERENCES roles (id),
  full_name     text NOT NULL,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  employee_code text NOT NULL UNIQUE CHECK (employee_code = upper(employee_code)),
  password_hash text NOT NULL,
  token_version integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users (role_id);

CREATE TABLE employee_profiles (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  department  text NOT NULL,
  designation text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE line_manager_profiles (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     integer NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  department  text NOT NULL,
  designation text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employee_manager_assignments (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  manager_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assigned_by integer REFERENCES users (id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id <> manager_id)
);
-- An employee has at most one current manager; history is kept in inactive rows.
CREATE UNIQUE INDEX uq_active_assignment_per_employee ON employee_manager_assignments (employee_id) WHERE is_active;
CREATE INDEX idx_assignments_manager ON employee_manager_assignments (manager_id) WHERE is_active;

CREATE TABLE wellbeing_assessments (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mood_rating   smallint NOT NULL CHECK (mood_rating BETWEEN 1 AND 5),
  stress_rating smallint NOT NULL CHECK (stress_rating BETWEEN 1 AND 5),
  energy_rating smallint NOT NULL CHECK (energy_rating BETWEEN 1 AND 5),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessments_employee_time ON wellbeing_assessments (employee_id, submitted_at DESC);
CREATE INDEX idx_assessments_time ON wellbeing_assessments (submitted_at);

CREATE TABLE survey_questions (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_text text NOT NULL,
  category      text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    integer REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE survey_submissions (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_survey_submissions_employee ON survey_submissions (employee_id, submitted_at DESC);

CREATE TABLE survey_responses (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id integer NOT NULL REFERENCES survey_submissions (id) ON DELETE CASCADE,
  question_id   integer NOT NULL REFERENCES survey_questions (id),
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);
CREATE INDEX idx_survey_responses_question ON survey_responses (question_id);

CREATE TABLE support_requests (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  manager_id      integer NOT NULL REFERENCES users (id),
  type            text NOT NULL CHECK (type IN ('BREAK', 'DISCUSSION')),
  status          text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED')),
  reason          text,
  manager_comment text,
  resolved_by     integer REFERENCES users (id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_requests_employee ON support_requests (employee_id, created_at DESC);
CREATE INDEX idx_requests_manager_status ON support_requests (manager_id, status);

CREATE TABLE meetings (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id          integer REFERENCES support_requests (id) ON DELETE SET NULL,
  employee_id         integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  manager_id          integer NOT NULL REFERENCES users (id),
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
  purpose             text,
  location            text,
  status              text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  cancellation_reason text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meetings_employee ON meetings (employee_id, scheduled_at);
CREATE INDEX idx_meetings_manager ON meetings (manager_id, scheduled_at);

CREATE TABLE notifications (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  related_user_id integer REFERENCES users (id) ON DELETE SET NULL,
  type            text NOT NULL,
  title           text NOT NULL,
  message         text NOT NULL,
  entity_type     text,
  entity_id       integer,
  is_read         boolean NOT NULL DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, is_read, created_at DESC);

CREATE TABLE application_settings (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key         text NOT NULL UNIQUE,
  value       text NOT NULL,
  description text NOT NULL,
  updated_by  integer REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only record of who did what; rows are never updated.
CREATE TABLE audit_logs (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    integer REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text,
  entity_id   integer,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles', 'users', 'employee_profiles', 'line_manager_profiles', 'employee_manager_assignments',
    'wellbeing_assessments', 'survey_questions', 'survey_submissions', 'survey_responses',
    'support_requests', 'meetings', 'notifications', 'application_settings', 'password_reset_tokens'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
