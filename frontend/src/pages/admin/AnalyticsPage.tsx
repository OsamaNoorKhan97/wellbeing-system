import { useState } from 'react';
import { BarChart, DonutChart, LineChart, chartColors } from '../../components/charts';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, PageLoader, Tabs } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { formatDay, requestStatusLabels } from '../../lib/format';
import { likertOptions } from '../../lib/ratings';
import { analyticsService } from '../../services';
import type { RequestStatus, SurveyAnalytics, Trends } from '../../types';

const periods = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const likertColors = ['#be123c', '#f59e0b', '#94a3b8', '#2dd4bf', '#0f766e'];
const statusColors: Record<RequestStatus, string> = {
  PENDING: chartColors.amber,
  APPROVED: chartColors.green,
  REJECTED: chartColors.rose,
  SCHEDULED: chartColors.blue,
  COMPLETED: chartColors.teal,
  CANCELLED: chartColors.slate,
};

const score = (value: number | null) => (value === null ? <span className="text-slate-400">Hidden</span> : <span className="font-medium text-ink tabular-nums">{value.toFixed(2)}</span>);

function RequestBreakdown({ trends, type, title }: { trends: Trends; type: 'BREAK' | 'DISCUSSION'; title: string }) {
  const rows = trends.requestStatus.filter((row) => row.type === type);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card title={title} description={`Requests created in the last ${trends.days} days, by current status`}>
      {total === 0 ? (
        <EmptyState title="No requests in this period" />
      ) : (
        <DonutChart
          centerValue={total}
          centerLabel="requests"
          summary={`${total} ${title.toLowerCase()} by status`}
          segments={rows.map((row) => ({ label: requestStatusLabels[row.status], value: row.count, color: statusColors[row.status] }))}
        />
      )}
    </Card>
  );
}

function SurveyResults({ survey }: { survey: SurveyAnalytics }) {
  return (
    <Card
      title="Survey results by question"
      description={`Based on each employee's most recent submission · ${survey.participation.completed} of ${survey.participation.eligible} employees completed the current cycle (${survey.participation.rate}%)`}
      padded={false}
    >
      {survey.questions.length === 0 ? (
        <EmptyState title="No survey questions" />
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 px-5 py-3 text-xs text-slate-600">
            {likertOptions.map((option, index) => (
              <li key={option.value} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: likertColors[index] }} aria-hidden />
                {option.label}
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-slate-100">
            {survey.questions.map((question) => (
              <li key={question.id} className="grid gap-x-6 gap-y-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] md:items-center">
                <div>
                  <p className="text-sm font-medium text-ink">{question.text}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {question.category} · {question.respondents} response{question.respondents === 1 ? '' : 's'}
                    {!question.isActive && <Badge>Inactive</Badge>}
                  </p>
                </div>
                {question.distribution && question.respondents > 0 ? (
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={question.distribution.map((count, index) => `${likertOptions[index].label}: ${count}`).join(', ')}>
                    {question.distribution.map((count, index) =>
                      count > 0 ? <div key={index} style={{ width: `${(count / question.respondents) * 100}%`, background: likertColors[index] }} title={`${likertOptions[index].label}: ${count}`} /> : null,
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Hidden until at least {survey.minGroupSize} employees have answered</p>
                )}
                <p className="text-sm md:text-right">
                  {question.average === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <>
                      <span className="text-lg font-semibold text-ink tabular-nums">{question.average.toFixed(2)}</span>
                      <span className="text-xs text-slate-400"> / 5</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState('30');
  const trends = useFetch(() => analyticsService.trends(Number(period)), [period]);
  const survey = useFetch(() => analyticsService.survey(), []);

  const error = trends.error ?? survey.error;
  const data = trends.data;
  const labels = data?.daily.map((day) => formatDay(day.date)) ?? [];

  return (
    <>
      <PageHeader title="Analytics" description="Aggregated well-being and survey results for the whole organization." actions={<Tabs value={period} onChange={setPeriod} options={periods} />} />
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            trends.reload();
            survey.reload();
          }}
        />
      ) : !data || !survey.data ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          <Alert tone="info">
            To protect individuals, averages are shown only when at least <strong>{data.minGroupSize}</strong> employees contributed. Smaller groups appear as “Hidden”. You can change this threshold in Settings.
          </Alert>

          <Card title="Average well-being ratings" description={`Daily organization-wide averages on a 1–5 scale, last ${data.days} days. For stress, lower is better.`}>
            <LineChart
              labels={labels}
              min={1}
              max={5}
              formatValue={(value) => value.toFixed(1)}
              series={[
                { name: 'Mood', color: chartColors.teal, values: data.daily.map((day) => day.avgMood) },
                { name: 'Stress', color: chartColors.rose, values: data.daily.map((day) => day.avgStress) },
                { name: 'Energy', color: chartColors.amber, values: data.daily.map((day) => day.avgEnergy) },
              ]}
              summary={`Average mood, stress and energy per day over the last ${data.days} days`}
            />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Check-in participation" description="Employees who submitted at least one check-in per day">
              <BarChart
                labels={labels}
                series={[{ name: 'Employees', color: chartColors.teal, values: data.daily.map((day) => day.respondents) }]}
                summary={`Number of employees checking in per day over the last ${data.days} days`}
              />
            </Card>
            <Card title="Survey submissions" description="Completed surveys per day">
              <BarChart
                labels={labels}
                series={[{ name: 'Surveys', color: chartColors.blue, values: data.daily.map((day) => day.surveys) }]}
                summary={`Survey submissions per day over the last ${data.days} days`}
              />
            </Card>
            <RequestBreakdown trends={data} type="BREAK" title="Break requests" />
            <RequestBreakdown trends={data} type="DISCUSSION" title="Discussion requests" />
          </div>

          <Card title="Well-being by department" description={`Check-ins from the last ${data.days} days`} padded={false}>
            {data.departments.length === 0 ? (
              <EmptyState title="No departments yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Employees</th>
                      <th>Participating</th>
                      <th>Check-ins</th>
                      <th>Avg. mood</th>
                      <th>Avg. stress</th>
                      <th>Avg. energy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.departments.map((row) => (
                      <tr key={row.department}>
                        <td className="font-medium whitespace-nowrap !text-ink">{row.department}</td>
                        <td className="tabular-nums">{row.employees}</td>
                        <td className="tabular-nums">
                          {row.respondents} <span className="text-xs text-slate-400">({row.employees ? Math.round((row.respondents / row.employees) * 100) : 0}%)</span>
                        </td>
                        <td className="tabular-nums">{row.checkIns}</td>
                        <td>{score(row.mood)}</td>
                        <td>{score(row.stress)}</td>
                        <td>{score(row.energy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <SurveyResults survey={survey.data} />
        </div>
      )}
    </>
  );
}
