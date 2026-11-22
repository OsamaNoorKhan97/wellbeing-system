import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { employeeService } from '../api/services';
import { BreakRecommendationCard } from '../components/BreakRecommendationCard';
import { LineChart } from '../components/charts';
import { MeetingCard, RequestCard } from '../components/common';
import { Avatar, Badge, Button, Card, Empty, Row, Screen, SectionHeader, SkeletonList, StatCard, StatGrid, T } from '../components/ui';
import { colors, spacing } from '../constants/theme';
import { Boundary, useApi, useRefresh } from '../hooks/useData';
import { describeHours, formatDateTime, timeAgo } from '../lib/format';
import { ratingOption } from '../lib/ratings';
import { useAuth } from '../store/auth';
import type { Assessment } from '../types';

function tips(latest: Assessment | undefined): string[] {
  if (!latest) return ['Record your first well-being check-in to see personal suggestions here.'];
  const out: string[] = [];
  if (latest.stress >= 4) out.push('Your stress is high. Try five slow breaths or a short walk away from your screen.');
  if (latest.energy <= 2) out.push('Your energy is low. A glass of water, some daylight and a proper break can help.');
  if (latest.mood <= 2) out.push('If you are feeling low, talking to your Line Manager can help. Use Need Help any time.');
  if (!out.length) out.push('You are doing well. Keep taking regular breaks and checking in.');
  return out;
}

export function EmployeeHome() {
  const router = useRouter();
  const client = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const query = useApi(['dashboard', 'employee'], () => employeeService.dashboard());
  const { refreshing, onRefresh } = useRefresh(query.refetch);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Row>
        <Avatar name={user.fullName} size={52} />
        <View style={{ flex: 1 }}>
          <T variant="heading" testID="welcome">Hello, {user.fullName.split(' ')[0]}</T>
          <T variant="small">{[user.designation, user.department].filter(Boolean).join(' · ') || user.employeeId}</T>
        </View>
      </Row>

      <Boundary query={query} skeleton={<SkeletonList count={4} height={110} />}>
        {(d) => {
          const latest = d.recentAssessments[0] ?? d.assessmentStatus.latest ?? undefined;
          const pendingBreaks = d.recentRequests.filter((r) => r.type === 'BREAK' && r.status === 'PENDING').length;
          const pendingTalks = d.recentRequests.filter((r) => r.type === 'DISCUSSION' && r.status === 'PENDING').length;
          const trend = [...d.recentAssessments].reverse().map((a) => ({ label: new Date(a.submittedAt).getDate().toString(), value: a.mood }));
          return (
            <>
              {d.breakRecommendation ? (
                <BreakRecommendationCard
                  recommendation={d.breakRecommendation}
                  canRequest={!!d.manager}
                  onRequested={() => void client.invalidateQueries({ queryKey: ['dashboard'] })}
                />
              ) : null}

              <Card testID="current-ratings">
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="subheading">Your latest check-in</T>
                  {latest ? <T variant="caption">{timeAgo(latest.submittedAt)}</T> : null}
                </Row>
                {latest ? (
                  <Row style={{ justifyContent: 'space-around', marginTop: spacing.md }}>
                    {(['mood', 'stress', 'energy'] as const).map((c) => (
                      <View key={c} style={{ alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: 34 }}>{ratingOption(c, latest[c]).emoji}</Text>
                        <T variant="caption">{c[0]!.toUpperCase() + c.slice(1)}</T>
                        <T variant="small" color={colors.text} style={{ fontWeight: '700' }}>{latest[c]}/5 · {ratingOption(c, latest[c]).label}</T>
                      </View>
                    ))}
                  </Row>
                ) : (
                  <T variant="small" style={{ marginTop: 8 }}>No check-in yet. It takes less than a minute.</T>
                )}
              </Card>

              <Card testID="checkin-status">
                <T variant="subheading">Well-being check</T>
                {d.assessmentStatus.canSubmit ? (
                  <>
                    <T variant="small">Your check-in is ready. You can check in once every {describeHours(d.assessmentStatus.intervalHours)}.</T>
                    <Button title="Start check-in" icon="pulse" onPress={() => router.push('/check-in' as never)} testID="start-checkin" />
                  </>
                ) : (
                  <>
                    <Badge label="Completed" tone="success" />
                    <T variant="small">Next check-in available {formatDateTime(d.assessmentStatus.nextAvailableAt)}.</T>
                  </>
                )}
              </Card>

              <Card testID="survey-status">
                <T variant="subheading">Organizational Behavior survey</T>
                {d.surveyStatus.completed ? (
                  <>
                    <Badge label="Completed" tone="success" />
                    <T variant="small">Next survey available {formatDateTime(d.surveyStatus.nextAvailableAt)}.</T>
                  </>
                ) : d.surveyStatus.activeQuestionCount === 0 ? (
                  <T variant="small">There are no survey questions right now.</T>
                ) : (
                  <>
                    <T variant="small">Your survey is open ({d.surveyStatus.activeQuestionCount} questions). It repeats every {d.surveyStatus.frequencyDays} days.</T>
                    <Button title="Take the survey" icon="document-text" variant="secondary" onPress={() => router.push('/survey' as never)} testID="start-survey" />
                  </>
                )}
              </Card>

              <StatGrid>
                <StatCard label="Pending breaks" value={pendingBreaks} icon="cafe-outline" tone={pendingBreaks ? 'warning' : 'neutral'} onPress={() => router.push('/help' as never)} />
                <StatCard label="Pending discussions" value={pendingTalks} icon="chatbubbles-outline" tone={pendingTalks ? 'warning' : 'neutral'} onPress={() => router.push('/help' as never)} />
              </StatGrid>

              {trend.length > 1 ? (
                <Card>
                  <T variant="subheading">Your mood trend</T>
                  <LineChart points={trend} max={5} />
                </Card>
              ) : null}

              <Card>
                <T variant="subheading">Suggestions for you</T>
                {tips(latest).map((t) => (
                  <T key={t} variant="small" color={colors.text} style={{ marginTop: 6 }}>• {t}</T>
                ))}
              </Card>

              <SectionHeader title="Upcoming meetings" action="See all" onAction={() => router.push('/my-meetings' as never)} />
              {d.upcomingMeetings.length ? d.upcomingMeetings.slice(0, 3).map((m) => <MeetingCard key={m.id} meeting={m} />) : <Empty icon="calendar-outline" title="No meetings scheduled" />}

              {d.recentRequests.length ? (
                <>
                  <SectionHeader title="Recent requests" action="Need Help" onAction={() => router.push('/help' as never)} />
                  {d.recentRequests.slice(0, 3).map((r) => <RequestCard key={r.id} request={r} />)}
                </>
              ) : null}

              <SectionHeader title="Recent notifications" action={d.unreadNotifications ? `${d.unreadNotifications} unread` : 'See all'} onAction={() => router.push('/notifications' as never)} />
              {d.recentNotifications.length ? (
                d.recentNotifications.slice(0, 3).map((n) => (
                  <Card key={n.id} onPress={() => router.push('/notifications' as never)}>
                    <T variant="body" style={{ fontWeight: n.isRead ? '500' : '800' }}>{n.title}</T>
                    <T variant="small" numberOfLines={2}>{n.message}</T>
                  </Card>
                ))
              ) : (
                <Empty icon="notifications-outline" title="You are all caught up" />
              )}
            </>
          );
        }}
      </Boundary>
    </Screen>
  );
}
