import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { assessmentService, surveyService } from '../../src/api/services';
import { RoleGate } from '../../src/components/RoleGate';
import { Badge, Button, Card, Empty, Row, Screen, Segmented, SkeletonList, T } from '../../src/components/ui';
import { spacing } from '../../src/constants/theme';
import { Boundary, useApi, usePaged, useRefresh } from '../../src/hooks/useData';
import { describeHours, formatDateTime } from '../../src/lib/format';
import { ratingOption } from '../../src/lib/ratings';

function Inner() {
  const router = useRouter();
  const [tab, setTab] = useState<'checkin' | 'survey'>('checkin');
  const status = useApi(['assessments', 'status'], () => assessmentService.status());
  const survey = useApi(['survey', 'status'], () => surveyService.status());
  const history = usePaged(['assessments', 'history'], (page, pageSize) => assessmentService.list({ page, pageSize }));
  const subs = usePaged(['survey', 'history'], (page, pageSize) => surveyService.submissions({ page, pageSize }));
  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([status.refetch(), survey.refetch(), history.refetch(), subs.refetch()]);
  });

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'checkin', label: 'Well-being check' }, { value: 'survey', label: 'OB survey' }]} />
      {tab === 'checkin' ? (
        <>
          <Boundary query={status} skeleton={<SkeletonList count={1} height={120} />}>
            {(s) => (
              <Card testID="assessment-status" style={{ gap: spacing.sm }}>
                <T variant="subheading">Mood · Stress · Energy</T>
                <T variant="small">One check-in every {describeHours(s.intervalHours)}.</T>
                {s.canSubmit ? (
                  <Button title="Start check-in" icon="pulse" onPress={() => router.push('/check-in' as never)} testID="assess-start" />
                ) : (
                  <>
                    <Badge label="Already submitted" tone="success" />
                    <T variant="small">Next check-in: {formatDateTime(s.nextAvailableAt)}</T>
                    <Button title="Start check-in" onPress={() => undefined} disabled />
                  </>
                )}
              </Card>
            )}
          </Boundary>
          <T variant="subheading">History</T>
          {history.isLoading ? <SkeletonList /> : history.items.length === 0 ? <Empty icon="pulse-outline" title="No check-ins yet" /> : null}
          {history.items.map((a) => (
            <Card key={a.id}>
              <T variant="caption">{formatDateTime(a.submittedAt)}</T>
              <Row style={{ justifyContent: 'space-around', marginTop: 6 }}>
                {(['mood', 'stress', 'energy'] as const).map((c) => (
                  <View key={c} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 26 }}>{ratingOption(c, a[c]).emoji}</Text>
                    <T variant="caption">{c} {a[c]}/5</T>
                  </View>
                ))}
              </Row>
            </Card>
          ))}
          {history.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void history.fetchNextPage()} loading={history.isFetchingNextPage} /> : null}
        </>
      ) : (
        <>
          <Boundary query={survey} skeleton={<SkeletonList count={1} height={120} />}>
            {(s) => (
              <Card testID="survey-status-card" style={{ gap: spacing.sm }}>
                <T variant="subheading">Organizational Behavior survey</T>
                <T variant="small">Repeats every {s.frequencyDays} days · {s.activeQuestionCount} questions</T>
                {s.completed ? (
                  <>
                    <Badge label="Completed" tone="success" />
                    <T variant="small">Next survey: {formatDateTime(s.nextAvailableAt)}</T>
                  </>
                ) : (
                  <Button title="Take the survey" icon="document-text" onPress={() => router.push('/survey' as never)} disabled={s.activeQuestionCount === 0} testID="survey-start" />
                )}
              </Card>
            )}
          </Boundary>
          <T variant="subheading">Previous surveys</T>
          {subs.isLoading ? <SkeletonList /> : subs.items.length === 0 ? <Empty icon="document-text-outline" title="No surveys yet" /> : null}
          {subs.items.map((s) => {
            const avg = s.responses.length ? s.responses.reduce((t, r) => t + r.rating, 0) / s.responses.length : 0;
            return (
              <Card key={s.id}>
                <T variant="body" style={{ fontWeight: '700' }}>{formatDateTime(s.submittedAt)}</T>
                <T variant="small">{s.responses.length} answers · average {avg.toFixed(1)}/5</T>
              </Card>
            );
          })}
          {subs.hasNextPage ? <Button title="Load more" variant="secondary" onPress={() => void subs.fetchNextPage()} loading={subs.isFetchingNextPage} /> : null}
        </>
      )}
    </Screen>
  );
}

export default function Assessments() {
  return (
    <RoleGate allow={['EMPLOYEE']}>
      <Inner />
    </RoleGate>
  );
}
