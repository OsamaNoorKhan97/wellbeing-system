import { useLocalSearchParams, useRouter } from 'expo-router';
import { alertService, managerService, requestService } from '../../src/api/services';
import { RequestCard } from '../../src/components/common';
import { RoleGate } from '../../src/components/RoleGate';
import { Avatar, Badge, Card, Empty, Row, Screen, SectionHeader, SkeletonList, T } from '../../src/components/ui';
import { alertStatusLabels, alertTone, formatDate, formatDateTime } from '../../src/lib/format';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';

/** A Line Manager's view of one assigned employee: activity status, alerts and requests. Scores are never shown. */
function Inner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eid = Number(id);
  const router = useRouter();
  const team = useApi(['team', ''], () => managerService.team());
  const alerts = useApi(['alerts', 'team', eid], () => alertService.list({ status: 'all', pageSize: 100 }));
  const requests = useApi(['requests', 'team', eid], () => requestService.list({ pageSize: 100 }));
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([team.refetch(), alerts.refetch(), requests.refetch()]);
  });

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Boundary query={team} skeleton={<SkeletonList count={2} height={120} />}>
        {(members) => {
          const m = members.find((x) => x.id === eid);
          if (!m) return <Empty icon="person-outline" title="Employee not found" message="Only employees assigned to you are shown." />;
          const myAlerts = (alerts.data ?? []).filter((a) => a.employeeId === eid);
          const myRequests = (requests.data ?? []).filter((r) => r.employeeId === eid);
          return (
            <>
              <Card style={{ gap: 6 }} testID="team-detail">
                <Row>
                  <Avatar name={m.fullName} size={56} />
                  <Row style={{ flex: 1 }}>
                    <T variant="heading" style={{ flex: 1 }}>{m.fullName}</T>
                    {!m.isActive ? <Badge label="Inactive" tone="neutral" /> : null}
                  </Row>
                </Row>
                <T variant="small">{m.employeeId} · {m.designation ?? '—'} · {m.department ?? '—'}</T>
                <T variant="small">{m.email}</T>
                <T variant="small">Assigned since {formatDate(m.assignedAt)}</T>
              </Card>
              <Card style={{ gap: 4 }}>
                <T variant="subheading">Activity</T>
                <T variant="small">Last check-in: {m.lastCheckInAt ? formatDateTime(m.lastCheckInAt) : 'none yet'} {m.checkedInToday ? '(today)' : ''}</T>
                <T variant="small">Survey: {m.surveyCompleted ? `completed ${formatDate(m.lastSurveyAt)}` : 'not completed this cycle'}</T>
                <T variant="small">Pending requests: {m.pendingRequests}</T>
              </Card>

              <SectionHeader title="Well-being alerts" />
              {myAlerts.length ? (
                myAlerts.map((a) => (
                  <Card key={a.id} onPress={() => router.push(`/alert/${a.id}` as never)}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T variant="small">{formatDate(a.triggeredAt)}</T>
                      <Badge label={alertStatusLabels[a.status]} tone={alertTone(a.status)} />
                    </Row>
                  </Card>
                ))
              ) : (
                <T variant="small">No alerts.</T>
              )}

              <SectionHeader title="Support requests" />
              {myRequests.length ? myRequests.map((r) => <RequestCard key={r.id} request={r} />) : <T variant="small">No requests.</T>}
            </>
          );
        }}
      </Boundary>
    </Screen>
  );
}

export default function TeamMember() {
  return (
    <RoleGate allow={['LINE_MANAGER']}>
      <Inner />
    </RoleGate>
  );
}
