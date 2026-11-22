import { useRouter } from 'expo-router';
import { alertService, analyticsService, userService } from '../api/services';
import { LineChart } from '../components/charts';
import { Badge, Card, Empty, Row, Screen, SectionHeader, SkeletonList, StatCard, StatGrid, T } from '../components/ui';
import { Boundary, useApi, useRefresh } from '../hooks/useData';
import { alertStatusLabels, alertTone, formatDate } from '../lib/format';
import { useAuth } from '../store/auth';

/** Home for HR and Super Admin: organisation-wide numbers. Super Admin additionally sees user counts by role. */
export function AdminHome() {
  const router = useRouter();
  const user = useAuth((s) => s.user)!;
  const isSuper = user.role === 'SUPER_ADMIN';
  const summary = useApi(['analytics', 'summary'], () => analyticsService.summary());
  const trends = useApi(['analytics', 'trends', '14'], () => analyticsService.trends(14));
  const alerts = useApi(['alerts', 'home'], () => alertService.list({ status: 'open', pageSize: 3 }));
  // Counts come from the pagination totals of one-row queries.
  const count = (key: string, query: Parameters<typeof userService.list>[0]) =>
    useApi(['users', 'count', key], async () => {
      const r = await userService.list({ ...query, pageSize: 1 });
      return { data: r.meta?.total ?? r.data.length };
    }, { enabled: isSuper });
  const hr = count('HR', { role: 'HR' });
  const supers = count('SUPER', { role: 'SUPER_ADMIN' });
  const active = count('active', { status: 'active' });
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([summary.refetch(), trends.refetch(), alerts.refetch()]);
  });
  const total = (q: { data: number | undefined }) => q.data;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <T variant="heading" testID="welcome">Hello, {user.fullName.split(' ')[0]}</T>
      <T variant="small">{isSuper ? 'System overview' : 'Organization well-being overview'}</T>
      <Boundary query={summary} skeleton={<SkeletonList count={4} height={100} />}>
        {(s) => (
          <>
            <StatGrid>
              <StatCard label="Employees" value={s.totalEmployees} icon="people" onPress={() => router.push('/employees' as never)} />
              <StatCard label="Line Managers" value={s.totalLineManagers} icon="briefcase" />
              {isSuper ? <StatCard label="HR users" value={total(hr) ?? '…'} icon="shield" /> : null}
              {isSuper ? <StatCard label="Super Admins" value={total(supers) ?? '…'} icon="key" /> : null}
              {isSuper ? <StatCard label="Active users" value={total(active) ?? '…'} icon="checkmark-circle" tone="success" /> : null}
              <StatCard label="Check-ins today" value={s.todaysAssessments} icon="pulse" tone="success" />
              <StatCard label="Survey submissions" value={s.surveySubmissions} icon="document-text" />
              <StatCard label="This cycle" value={s.surveySubmissionsThisCycle} icon="repeat" />
              <StatCard label="Open alerts" value={s.openAlerts} icon="warning" tone={s.openAlerts ? 'danger' : 'neutral'} onPress={() => router.push((isSuper ? '/all-alerts' : '/alerts') as never)} />
              <StatCard label="Pending requests" value={s.pendingRequests} icon="hand-left" tone={s.pendingRequests ? 'warning' : 'neutral'} />
              <StatCard label="Scheduled meetings" value={s.scheduledMeetings} icon="calendar" />
              <StatCard label="Unassigned employees" value={s.unassignedEmployees} icon="person-remove" tone={s.unassignedEmployees ? 'warning' : 'neutral'} />
            </StatGrid>
          </>
        )}
      </Boundary>

      <Boundary query={trends} skeleton={<SkeletonList count={1} height={180} />}>
        {(t) => (
          <Card testID="home-trend">
            <T variant="subheading">Check-ins, last 14 days</T>
            <LineChart points={t.daily.map((d) => ({ label: d.date.slice(5), value: d.assessments }))} />
          </Card>
        )}
      </Boundary>

      <SectionHeader title="Open well-being alerts" action="See all" onAction={() => router.push((isSuper ? '/all-alerts' : '/alerts') as never)} />
      <Boundary query={alerts} skeleton={<SkeletonList count={2} />}>
        {(rows) =>
          rows.length ? (
            rows.map((a) => (
              <Card key={a.id} onPress={() => router.push(`/alert/${a.id}` as never)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="body" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{a.employeeName}</T>
                  <Badge label={alertStatusLabels[a.status]} tone={alertTone(a.status)} />
                </Row>
                <T variant="small">{a.department ?? 'No department'} · raised {formatDate(a.triggeredAt)}</T>
              </Card>
            ))
          ) : (
            <Empty icon="shield-checkmark-outline" title="No open alerts" />
          )
        }
      </Boundary>
    </Screen>
  );
}
