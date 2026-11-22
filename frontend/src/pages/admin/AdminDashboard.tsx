import type { ReactNode } from 'react';
import { FiAlertTriangle, FiCalendar, FiClipboard, FiHeart, FiInbox, FiUserCheck, FiUsers } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { BarChart, DonutChart, LineChart, chartColors } from '../../components/charts';
import { Alert, Card, ErrorState, PageHeader, Skeleton, StatCard } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { formatDay } from '../../lib/format';
import { analyticsService } from '../../services';

interface Props {
  title?: string;
  /** Where this portal lives, so links stay inside it. */
  base?: string;
  /** Extra content shown above the figures (used by the Super Admin for the configuration summary). */
  top?: ReactNode;
}

export function AdminDashboard({ title = 'HR Dashboard', base = '/admin', top }: Props) {
  const summary = useFetch(() => analyticsService.summary(), []);
  const trends = useFetch(() => analyticsService.trends(30), []);
  const survey = useFetch(() => analyticsService.survey(), []);

  const error = summary.error ?? trends.error ?? survey.error;
  const retry = () => {
    summary.reload();
    trends.reload();
    survey.reload();
  };

  const s = summary.data;
  const days = trends.data?.daily ?? [];
  const dayLabels = days.map((day) => formatDay(day.date));
  const total = (key: 'assessments' | 'breakRequests' | 'discussionRequests' | 'activity') => days.reduce((sum, day) => sum + day[key], 0);

  return (
    <>
      <PageHeader title={title} description="Organization-wide activity. Figures are totals and averages; individual responses are never shown." />
      {top}
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <>
          {s && s.unassignedEmployees > 0 && (
            <div className="mb-6">
              <Alert tone="warning">
                {s.unassignedEmployees} employee{s.unassignedEmployees === 1 ? ' has' : 's have'} no Line Manager and cannot send requests.{' '}
                <Link to={`${base}/assignments`} className="font-medium underline">
                  Assign a manager
                </Link>
              </Alert>
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {!s ? (
              [0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20" />)
            ) : (
              <>
                <StatCard label="Total Employees" value={s.totalEmployees} icon={<FiUsers />} />
                <StatCard label="Total Line Managers" value={s.totalLineManagers} icon={<FiUserCheck />} tone="violet" />
                <StatCard label="Today's Well-Being Submissions" value={s.todaysAssessments} icon={<FiHeart />} tone="green" />
                <StatCard label="Survey Submissions" value={s.surveySubmissions} icon={<FiClipboard />} tone="blue" hint={`${s.surveySubmissionsThisCycle} in the current cycle`} />
                <StatCard label="Pending Employee Requests" value={s.pendingRequests} icon={<FiInbox />} tone="amber" />
                <StatCard label="Scheduled Meetings" value={s.scheduledMeetings} icon={<FiCalendar />} tone="slate" />
                <StatCard label="Open Well-Being Alerts" value={s.openAlerts} icon={<FiAlertTriangle />} tone={s.openAlerts > 0 ? 'red' : 'green'} hint={s.openAlerts > 0 ? 'Employees who may need support' : 'No one flagged right now'} />
              </>
            )}
          </div>

          {!trends.data || !survey.data ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-72" />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Daily assessment submissions" description={`Last 30 days · ${total('assessments')} check-ins`}>
                <LineChart
                  labels={dayLabels}
                  series={[{ name: 'Check-ins', color: chartColors.teal, values: days.map((day) => day.assessments) }]}
                  summary={`Daily well-being check-ins over the last 30 days, ${total('assessments')} in total`}
                />
              </Card>

              <Card title="Weekly assessment submissions" description="Last 8 weeks, by week starting Monday">
                <BarChart
                  labels={trends.data.weekly.map((week) => formatDay(week.weekStart))}
                  series={[{ name: 'Check-ins', color: chartColors.teal, values: trends.data.weekly.map((week) => week.assessments) }]}
                  summary="Weekly well-being check-ins over the last eight weeks"
                />
              </Card>

              <Card title="Survey participation" description={`Current ${survey.data.frequencyDays}-day cycle`}>
                <DonutChart
                  centerValue={`${survey.data.participation.rate}%`}
                  centerLabel="completed"
                  summary={`${survey.data.participation.completed} of ${survey.data.participation.eligible} employees completed the survey`}
                  segments={[
                    { label: 'Completed', value: survey.data.participation.completed, color: chartColors.teal },
                    { label: 'Not yet completed', value: survey.data.participation.pending, color: chartColors.slate },
                  ]}
                />
              </Card>

              <Card title="Break and discussion request trends" description={`Last 30 days · ${total('breakRequests')} break, ${total('discussionRequests')} discussion`}>
                <BarChart
                  labels={dayLabels}
                  series={[
                    { name: 'Break requests', color: chartColors.amber, values: days.map((day) => day.breakRequests) },
                    { name: 'Discussion requests', color: chartColors.blue, values: days.map((day) => day.discussionRequests) },
                  ]}
                  summary="Break and discussion requests per day over the last 30 days"
                />
              </Card>

              <Card title="Overall application activity" description="Recorded actions (sign-ins, submissions, requests, admin changes) and people active per day" className="lg:col-span-2">
                <LineChart
                  labels={dayLabels}
                  series={[
                    { name: 'Actions', color: chartColors.violet, values: days.map((day) => day.activity) },
                    { name: 'Active users', color: chartColors.teal, values: days.map((day) => day.activeUsers) },
                  ]}
                  summary={`Application activity per day over the last 30 days, ${total('activity')} actions in total`}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
