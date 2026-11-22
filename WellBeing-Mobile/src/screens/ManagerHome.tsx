import { useRouter } from 'expo-router';
import { Boundary, useApi, useRefresh } from '../hooks/useData';
import { managerService } from '../api/services';
import { MeetingCard, RequestCard } from '../components/common';
import { Card, Empty, Row, Screen, SectionHeader, SkeletonList, StatCard, StatGrid, T } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../store/auth';

export function ManagerHome() {
  const router = useRouter();
  const user = useAuth((s) => s.user)!;
  const query = useApi(['dashboard', 'manager'], () => managerService.dashboard());
  const team = useApi(['team', ''], () => managerService.team());
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([query.refetch(), team.refetch()]);
  });
  const attention = (team.data ?? []).filter((m) => m.isActive && (!m.checkedInToday || m.pendingRequests > 0));

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <T variant="heading" testID="welcome">Hello, {user.fullName.split(' ')[0]}</T>
      <Boundary query={query} skeleton={<SkeletonList count={4} height={100} />}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Assigned employees" value={d.summary.assignedEmployees} icon="people" onPress={() => router.push('/employees' as never)} />
              <StatCard label="New alerts" value={d.summary.activeAlerts} icon="warning" tone={d.summary.activeAlerts ? 'danger' : 'neutral'} onPress={() => router.push('/alerts' as never)} />
              <StatCard label="Pending breaks" value={d.summary.pendingBreakRequests} icon="cafe" tone={d.summary.pendingBreakRequests ? 'warning' : 'neutral'} onPress={() => router.push('/requests' as never)} />
              <StatCard label="Pending discussions" value={d.summary.pendingDiscussionRequests} icon="chatbubbles" tone={d.summary.pendingDiscussionRequests ? 'warning' : 'neutral'} onPress={() => router.push('/requests' as never)} />
              <StatCard label="Upcoming meetings" value={d.summary.upcomingMeetings} icon="calendar" onPress={() => router.push('/meetings' as never)} />
            </StatGrid>

            <SectionHeader title="Employees needing attention" action="All employees" onAction={() => router.push('/employees' as never)} />
            {attention.length ? (
              attention.slice(0, 4).map((m) => (
                <Card key={m.id} onPress={() => router.push(`/team/${m.id}` as never)}>
                  <T variant="body" style={{ fontWeight: '700' }}>{m.fullName}</T>
                  <T variant="small">{!m.checkedInToday ? `No check-in today${m.lastCheckInAt ? ` · last ${formatDateTime(m.lastCheckInAt)}` : ' · none yet'}` : ''}{m.pendingRequests ? ` · ${m.pendingRequests} pending request(s)` : ''}</T>
                </Card>
              ))
            ) : (
              <Empty icon="happy-outline" title="Everyone is on track" />
            )}

            <SectionHeader title="Pending requests" action="See all" onAction={() => router.push('/requests' as never)} />
            {d.recentRequests.filter((r) => r.status === 'PENDING').length ? d.recentRequests.filter((r) => r.status === 'PENDING').slice(0, 3).map((r) => <RequestCard key={r.id} request={r} showEmployee />) : <Empty icon="checkmark-done-outline" title="No pending requests" />}

            <SectionHeader title="Upcoming meetings" action="See all" onAction={() => router.push('/meetings' as never)} />
            {d.upcomingMeetings.length ? d.upcomingMeetings.slice(0, 3).map((m) => <MeetingCard key={m.id} meeting={m} showEmployee />) : <Empty icon="calendar-outline" title="No upcoming meetings" />}

            <SectionHeader title="Recent activity" />
            {d.recentActivity.length ? (
              d.recentActivity.slice(0, 5).map((a, i) => (
                <Row key={i} style={{ paddingVertical: 4 }}>
                  <T variant="small" style={{ flex: 1 }}>{a.employeeName}: {a.description}</T>
                  <T variant="caption">{formatDateTime(a.at)}</T>
                </Row>
              ))
            ) : (
              <T variant="small">No recent activity.</T>
            )}
          </>
        )}
      </Boundary>
    </Screen>
  );
}
