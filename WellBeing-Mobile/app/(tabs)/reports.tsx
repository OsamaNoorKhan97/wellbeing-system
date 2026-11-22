import { useState } from 'react';
import { analyticsService } from '../../src/api/services';
import { BarList, Distribution, LineChart } from '../../src/components/charts';
import { RoleGate } from '../../src/components/RoleGate';
import { Card, Chips, Row, Screen, Segmented, SectionHeader, SkeletonList, StatCard, StatGrid, T } from '../../src/components/ui';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';
import { surveyChoices } from '../../src/lib/format';
import type { Trends } from '../../src/types';

type Metric = 'avgMood' | 'avgStress' | 'avgEnergy';
const metricLabels: Record<Metric, string> = { avgMood: 'Mood', avgStress: 'Stress', avgEnergy: 'Energy' };

function Inner() {
  const [tab, setTab] = useState<'overview' | 'departments' | 'survey'>('overview');
  const [days, setDays] = useState('30');
  const [metric, setMetric] = useState<Metric>('avgMood');
  const [department, setDepartment] = useState('');
  const summary = useApi(['analytics', 'summary'], () => analyticsService.summary());
  const trends = useApi(['analytics', 'trends', days], () => analyticsService.trends(Number(days)));
  const survey = useApi(['analytics', 'survey'], () => analyticsService.survey());
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([summary.refetch(), trends.refetch(), survey.refetch()]);
  });

  const series = (t: Trends, key: 'assessments' | 'surveys' | 'breakRequests' | 'discussionRequests' | Metric) =>
    t.daily.map((d) => ({ label: d.date.slice(5), value: d[key] as number | null }));

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'departments', label: 'Departments' }, { value: 'survey', label: 'Survey' }]} />

      {tab === 'overview' ? (
        <>
          <Boundary query={summary} skeleton={<SkeletonList count={2} height={100} />}>
            {(s) => (
              <StatGrid>
                <StatCard label="Employees" value={s.totalEmployees} icon="people" />
                <StatCard label="Line Managers" value={s.totalLineManagers} icon="briefcase" />
                <StatCard label="Check-ins today" value={s.todaysAssessments} icon="pulse" tone="success" />
                <StatCard label="Open alerts" value={s.openAlerts} icon="warning" tone={s.openAlerts ? 'danger' : 'neutral'} />
                <StatCard label="Pending requests" value={s.pendingRequests} icon="hand-left" tone={s.pendingRequests ? 'warning' : 'neutral'} />
                <StatCard label="Scheduled meetings" value={s.scheduledMeetings} icon="calendar" />
                <StatCard label="Survey submissions" value={s.surveySubmissions} icon="document-text" />
                <StatCard label="Unassigned employees" value={s.unassignedEmployees} icon="person-remove" tone={s.unassignedEmployees ? 'warning' : 'neutral'} />
              </StatGrid>
            )}
          </Boundary>
          <Chips value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
          <Boundary query={trends} skeleton={<SkeletonList count={2} height={180} />}>
            {(t) => (
              <>
                <Card testID="chart-checkins">
                  <T variant="subheading">Check-ins per day</T>
                  <LineChart points={series(t, 'assessments')} />
                </Card>
                <Card testID="chart-wellbeing">
                  <T variant="subheading">Average {metricLabels[metric].toLowerCase()}</T>
                  <Chips value={metric} onChange={setMetric} options={(Object.keys(metricLabels) as Metric[]).map((m) => ({ value: m, label: metricLabels[m] }))} />
                  <LineChart points={series(t, metric)} max={5} />
                  <T variant="caption">Averages are hidden for groups smaller than {t.minGroupSize} people.</T>
                </Card>
                <Card>
                  <T variant="subheading">Requests by status</T>
                  <BarList rows={Object.entries(t.requestStatus.reduce<Record<string, number>>((acc, r) => ({ ...acc, [`${r.type === 'BREAK' ? 'Break' : 'Discussion'} · ${r.status.toLowerCase()}`]: r.count }), {})).map(([label, value]) => ({ label, value }))} />
                </Card>
              </>
            )}
          </Boundary>
        </>
      ) : null}

      {tab === 'departments' ? (
        <Boundary query={trends} skeleton={<SkeletonList count={3} height={120} />}>
          {(t) => {
            const names = t.departments.map((d) => d.department);
            const rows = department ? t.departments.filter((d) => d.department === department) : t.departments;
            return (
              <>
                <Chips value={department} onChange={setDepartment} options={[{ value: '', label: 'All departments' }, ...names.map((n) => ({ value: n, label: n }))]} />
                {rows.map((d) => (
                  <Card key={d.department} testID={`dept-${d.department}`} style={{ gap: 6 }}>
                    <T variant="subheading">{d.department}</T>
                    <T variant="small">{d.employees} employees · {d.respondents} checked in · {d.checkIns} check-ins</T>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T variant="small">Mood {d.mood?.toFixed(1) ?? 'n/a'}</T>
                      <T variant="small">Stress {d.stress?.toFixed(1) ?? 'n/a'}</T>
                      <T variant="small">Energy {d.energy?.toFixed(1) ?? 'n/a'}</T>
                    </Row>
                  </Card>
                ))}
                <T variant="caption">“n/a” means the group is below the privacy minimum of {t.minGroupSize}.</T>
              </>
            );
          }}
        </Boundary>
      ) : null}

      {tab === 'survey' ? (
        <Boundary query={survey} skeleton={<SkeletonList count={3} height={120} />}>
          {(s) => (
            <>
              <Card testID="survey-participation">
                <T variant="subheading">Participation this cycle</T>
                <T variant="small">{s.participation.completed} of {s.participation.eligible} completed ({Math.round(s.participation.rate * 100)}%) · {s.participation.pending} pending · cycle every {s.frequencyDays} days</T>
                <BarList rows={[{ label: 'Completed', value: s.participation.completed }, { label: 'Pending', value: s.participation.pending }]} max={Math.max(s.participation.eligible, 1)} />
              </Card>
              <SectionHeader title="Questions" />
              {s.questions.map((q) => (
                <Card key={q.id} style={{ gap: 4 }}>
                  <T variant="small" color="#0F1F1E">{q.text}</T>
                  <T variant="caption">{q.category} · {q.respondents} respondents · average {q.average?.toFixed(2) ?? 'n/a (group too small)'}</T>
                  {q.distribution ? <Distribution counts={q.distribution} labels={surveyChoices.map((c) => c.label.split(' ').map((w) => w[0]).join(''))} /> : null}
                </Card>
              ))}
            </>
          )}
        </Boundary>
      ) : null}
    </Screen>
  );
}

export default function Reports() {
  return (
    <RoleGate allow={['HR', 'SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
