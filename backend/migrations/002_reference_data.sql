-- Reference data the application needs in order to run at all.

INSERT INTO roles (name, description) VALUES
  ('EMPLOYEE', 'Records well-being check-ins, answers surveys and requests support'),
  ('LINE_MANAGER', 'Manages assigned employees, their requests and meetings'),
  ('HR_ADMIN', 'Administers users, assignments, surveys, settings and analytics');

INSERT INTO application_settings (key, value, description) VALUES
  ('daily_assessment_limit', '1', 'How many well-being check-ins an employee may submit per day'),
  ('survey_frequency_days', '30', 'Days an employee must wait before retaking the Organizational Behavior survey'),
  ('organization_timezone', 'Asia/Karachi', 'Time zone that defines when a "day" starts for daily limits and reports'),
  ('analytics_min_group_size', '3', 'Averages are hidden when fewer than this many employees contributed');

INSERT INTO survey_questions (question_text, category, display_order) VALUES
  ('I feel satisfied with my current job.', 'Job Satisfaction', 1),
  ('I feel motivated to perform my best at work.', 'Employee Motivation', 2),
  ('I feel engaged and absorbed in the work I do.', 'Employee Engagement', 3),
  ('I believe communication within my team is effective.', 'Communication', 4),
  ('My work environment allows me to do my job well.', 'Work Environment', 5),
  ('I feel valued by my organization.', 'Organizational Commitment', 6),
  ('I have a positive working relationship with my Line Manager.', 'Relationship with Management', 7),
  ('I feel committed to achieving my organization''s goals.', 'Organizational Commitment', 8);
