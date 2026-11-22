-- Super Admin role, HR rename, interval-based assessments, well-being alerts and meeting actions.

-- ---------------------------------------------------------------- roles
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'roles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%name%'
  LOOP
    EXECUTE format('ALTER TABLE roles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Existing Admin accounts keep their user rows; only the role they point to is renamed.
UPDATE roles SET name = 'HR', description = 'Manages users, assignments, surveys and organization-wide monitoring' WHERE name = 'HR_ADMIN';
INSERT INTO roles (name, description)
VALUES ('SUPER_ADMIN', 'Highest authority: global configuration, alert rules, HR and Line Manager accounts')
ON CONFLICT (name) DO NOTHING;
ALTER TABLE roles ADD CONSTRAINT roles_name_check CHECK (name IN ('EMPLOYEE', 'LINE_MANAGER', 'HR', 'SUPER_ADMIN'));

-- ---------------------------------------------------------------- settings
-- The per-day limit is replaced by a configurable interval in hours between two assessments.
DELETE FROM application_settings WHERE key = 'daily_assessment_limit';
INSERT INTO application_settings (key, value, description) VALUES
  ('assessment_interval_hours', '24', 'Hours an employee must wait between two well-being assessments'),
  ('alert_mood_threshold', '2', 'Mood at or below this rating counts as a poor indicator'),
  ('alert_stress_threshold', '4', 'Stress at or above this rating counts as a poor indicator'),
  ('alert_energy_threshold', '2', 'Energy at or below this rating counts as a poor indicator'),
  ('alert_indicators_required', '2', 'How many of the three indicators must be poor for an assessment to count as poor'),
  ('alert_consecutive_required', '2', 'Consecutive poor assessments that trigger a well-being alert'),
  ('alert_notify_line_manager', 'true', 'Notify the employee''s Line Manager when an alert is triggered'),
  ('alert_notify_hr', 'true', 'Notify all HR users when an alert is triggered')
ON CONFLICT (key) DO NOTHING;
UPDATE application_settings SET description = 'Days an employee must wait before retaking the Organizational Behavior survey' WHERE key = 'survey_frequency_days';

-- ---------------------------------------------------------------- well-being alerts
CREATE TABLE wellbeing_alerts (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id        integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  manager_id         integer REFERENCES users (id) ON DELETE SET NULL,
  alert_type         text NOT NULL DEFAULT 'CONSECUTIVE_POOR_ASSESSMENTS',
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
  assessment_ids     integer[] NOT NULL,
  last_assessment_id integer NOT NULL REFERENCES wellbeing_assessments (id) ON DELETE CASCADE,
  triggered_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_by    integer REFERENCES users (id) ON DELETE SET NULL,
  acknowledged_at    timestamptz,
  resolved_by        integer REFERENCES users (id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- The same sequence of assessments can only ever raise one alert.
  UNIQUE (employee_id, last_assessment_id)
);
CREATE INDEX idx_alerts_employee ON wellbeing_alerts (employee_id, triggered_at DESC);
CREATE INDEX idx_alerts_manager_status ON wellbeing_alerts (manager_id, status);
CREATE INDEX idx_alerts_status ON wellbeing_alerts (status, triggered_at DESC);

CREATE TABLE wellbeing_alert_comments (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id   integer NOT NULL REFERENCES wellbeing_alerts (id) ON DELETE CASCADE,
  author_id  integer REFERENCES users (id) ON DELETE SET NULL,
  comment    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alert_comments_alert ON wellbeing_alert_comments (alert_id, created_at);

CREATE TRIGGER trg_wellbeing_alerts_updated_at BEFORE UPDATE ON wellbeing_alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A break request raised from the recommendation points back at the alert that caused it.
ALTER TABLE support_requests ADD COLUMN alert_id integer REFERENCES wellbeing_alerts (id) ON DELETE SET NULL;
CREATE INDEX idx_requests_alert ON support_requests (alert_id) WHERE alert_id IS NOT NULL;

-- ---------------------------------------------------------------- meetings
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'meetings'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE meetings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE meetings ADD CONSTRAINT meetings_status_check
  CHECK (status IN ('SCHEDULED', 'RESCHEDULED', 'REJECTED', 'CANCELLED', 'COMPLETED'));

ALTER TABLE meetings
  ADD COLUMN rejection_reason text,
  ADD COLUMN reschedule_count integer NOT NULL DEFAULT 0,
  -- Snoozing only moves the manager's reminder; scheduled_at is never touched.
  ADD COLUMN reminder_snoozed_until timestamptz,
  ADD COLUMN reminder_snooze_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_reminder_at timestamptz;
CREATE INDEX idx_meetings_snooze_due ON meetings (reminder_snoozed_until) WHERE reminder_snoozed_until IS NOT NULL;

CREATE TABLE meeting_history (
  id                 integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id         integer NOT NULL REFERENCES meetings (id) ON DELETE CASCADE,
  actor_id           integer REFERENCES users (id) ON DELETE SET NULL,
  action             text NOT NULL CHECK (action IN ('RESCHEDULED', 'REJECTED', 'SNOOZED', 'REMINDER_SENT')),
  previous_scheduled_at timestamptz,
  new_scheduled_at   timestamptz,
  previous_duration_minutes integer,
  snoozed_until      timestamptz,
  reason             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meeting_history_meeting ON meeting_history (meeting_id, created_at);
