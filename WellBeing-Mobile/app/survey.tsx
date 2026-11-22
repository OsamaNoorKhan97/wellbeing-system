import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError, errorMessage } from '../src/api/client';
import { surveyService } from '../src/api/services';
import { RoleGate } from '../src/components/RoleGate';
import { ProgressBar } from '../src/components/charts';
import { Banner, Button, Card, Empty, Row, Screen, SkeletonList, T } from '../src/components/ui';
import { colors, radius, spacing, TOUCH } from '../src/constants/theme';
import { Boundary, useApi } from '../src/hooks/useData';
import { formatDateTime } from '../src/lib/format';
import { likertOptions } from '../src/lib/ratings';
import { drafts } from '../src/storage/drafts';
import { useAuth } from '../src/store/auth';

function SurveyInner() {
  const router = useRouter();
  const client = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const status = useApi(['survey', 'status'], () => surveyService.status());
  const questions = useApi(['survey', 'questions'], () => surveyService.questions());
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [missing, setMissing] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);
  const locked = useRef(false);

  // Restore an unfinished survey, and keep saving answers so nothing is lost on a dropped connection.
  useEffect(() => {
    void drafts.load<Record<number, number>>(user.id, 'survey').then((saved) => {
      if (saved) setAnswers(saved);
      loaded.current = true;
    });
  }, [user.id]);
  useEffect(() => {
    if (loaded.current && !done) void drafts.save(user.id, 'survey', answers);
  }, [answers, done, user.id]);

  const list = questions.data ?? [];
  const answered = list.filter((q) => answers[q.id]).length;

  const submit = async () => {
    if (locked.current) return;
    const unanswered = list.filter((q) => !answers[q.id]).map((q) => q.id);
    if (unanswered.length) {
      setMissing(unanswered);
      setReviewing(false);
      setIndex(list.findIndex((q) => q.id === unanswered[0]));
      return setError(`Please answer all questions (${unanswered.length} left).`);
    }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await surveyService.submit(list.map((q) => ({ questionId: q.id, rating: answers[q.id]! })));
      await drafts.clear(user.id, 'survey');
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SURVEY_ALREADY_COMPLETED') setError('You have already completed the survey for this period.');
      else if (e instanceof ApiError && e.isNetwork) setError('The connection dropped. Your answers are saved on this device; check your connection and send again.');
      else setError(errorMessage(e));
    } finally {
      await client.invalidateQueries({ queryKey: ['survey'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
      locked.current = false;
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: spacing.md }} testID="survey-done">
          <Text style={{ fontSize: 56 }}>🎉</Text>
          <T variant="heading">Survey submitted</T>
          <T variant="small" style={{ textAlign: 'center' }}>Thank you for your honest answers.</T>
        </Card>
        <Button title="Back to home" onPress={() => router.replace('/(tabs)' as never)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Boundary query={status} skeleton={<SkeletonList />}>
        {(s) =>
          s.completed ? (
            <Card testID="survey-locked" style={{ gap: spacing.sm }}>
              <T variant="subheading">Survey completed</T>
              <T variant="small">Next survey opens on {formatDateTime(s.nextAvailableAt)} (every {s.frequencyDays} days).</T>
            </Card>
          ) : (
            <Boundary query={questions} skeleton={<SkeletonList count={2} height={160} />}>
              {(qs) =>
                qs.length === 0 ? (
                  <Empty icon="document-text-outline" title="No questions right now" message="There is no active survey." />
                ) : reviewing ? (
                  <>
                    <T variant="subheading">Review your answers</T>
                    {qs.map((q, i) => (
                      <Card key={q.id} onPress={() => { setReviewing(false); setIndex(i); }}>
                        <T variant="small">{i + 1}. {q.text}</T>
                        <T variant="body" style={{ fontWeight: '700' }} color={colors.primary}>{likertOptions[(answers[q.id] ?? 1) - 1]!.label}</T>
                      </Card>
                    ))}
                    {error ? <Banner tone="danger" text={error} /> : null}
                    <Button title="Submit survey" onPress={submit} loading={busy} testID="survey-submit" />
                  </>
                ) : (
                  <>
                    <View style={{ gap: 6 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T variant="small">Question {index + 1} of {qs.length}</T>
                        <T variant="small">{answered}/{qs.length} answered</T>
                      </Row>
                      <ProgressBar value={answered / qs.length} />
                    </View>
                    {error ? <Banner tone="danger" text={error} /> : null}
                    <Card testID="survey-question" style={missing.includes(qs[index]!.id) ? { borderColor: colors.danger } : undefined}>
                      <T variant="caption">{qs[index]!.category}</T>
                      <T variant="subheading" style={{ marginBottom: spacing.md }}>{qs[index]!.text}</T>
                      <View style={{ gap: spacing.sm }}>
                        {likertOptions.map((o) => {
                          const active = answers[qs[index]!.id] === o.value;
                          return (
                            <Pressable
                              key={o.value}
                              testID={`answer-${o.value}`}
                              onPress={() => {
                                setMissing((m) => m.filter((id) => id !== qs[index]!.id));
                                setAnswers((a) => ({ ...a, [qs[index]!.id]: o.value }));
                              }}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: active }}
                              style={{ minHeight: TOUCH, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : '#fff', justifyContent: 'center' }}
                            >
                              <Text style={{ fontSize: 15, fontWeight: active ? '800' : '500', color: active ? colors.primary : colors.text }}>{o.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Card>
                    <Row>
                      <Button title="Back" variant="secondary" onPress={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} style={{ flex: 1 }} />
                      {index < qs.length - 1 ? (
                        <Button title="Next" onPress={() => setIndex((i) => i + 1)} style={{ flex: 1 }} testID="survey-next" />
                      ) : (
                        <Button title="Review" onPress={() => { setError(null); setReviewing(true); }} style={{ flex: 1 }} testID="survey-review" />
                      )}
                    </Row>
                  </>
                )
              }
            </Boundary>
          )
        }
      </Boundary>
    </Screen>
  );
}

export default function Survey() {
  return (
    <RoleGate allow={['EMPLOYEE']}>
      <SurveyInner />
    </RoleGate>
  );
}
