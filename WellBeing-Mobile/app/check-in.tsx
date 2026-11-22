import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError, errorMessage } from '../src/api/client';
import { assessmentService } from '../src/api/services';
import { BreakRecommendationCard } from '../src/components/BreakRecommendationCard';
import { RoleGate } from '../src/components/RoleGate';
import { Banner, Button, Card, Row, Screen, SkeletonList, T } from '../src/components/ui';
import { colors, radius, spacing } from '../src/constants/theme';
import { Boundary, useApi } from '../src/hooks/useData';
import { describeHours, formatDateTime } from '../src/lib/format';
import { type RatingCategory, ratingOption, ratingScales } from '../src/lib/ratings';
import type { BreakRecommendation } from '../src/types';

const CATEGORIES: RatingCategory[] = ['mood', 'stress', 'energy'];

function RatingPicker({ category, value, onChange }: { category: RatingCategory; value: number | null; onChange: (v: number) => void }) {
  const scale = ratingScales[category];
  return (
    <Card testID={`picker-${category}`}>
      <T variant="subheading">{scale.title}</T>
      <T variant="small">{scale.question}</T>
      <Row style={{ justifyContent: 'space-between', marginTop: spacing.md }}>
        {scale.options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              testID={`${category}-${o.value}`}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityLabel={`${scale.title} ${o.value} of 5, ${o.label}`}
              accessibilityState={{ selected: active }}
              style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 2, borderColor: active ? colors.primary : 'transparent', backgroundColor: active ? colors.primarySoft : colors.neutralSoft }}
            >
              <Text style={{ fontSize: 28 }}>{o.emoji}</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }} numberOfLines={1}>{o.value}</Text>
            </Pressable>
          );
        })}
      </Row>
      <T variant="small" color={colors.primary} style={{ marginTop: 6, fontWeight: '700', minHeight: 18 }}>{value ? ratingOption(category, value).label : 'Tap to choose'}</T>
    </Card>
  );
}

function CheckInInner() {
  const router = useRouter();
  const client = useQueryClient();
  const status = useApi(['assessments', 'status'], () => assessmentService.status());
  const [ratings, setRatings] = useState<Record<RatingCategory, number | null>>({ mood: null, stress: null, energy: null });
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ recommendation: BreakRecommendation | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false); // blocks double taps before React re-renders

  const complete = CATEGORIES.every((c) => ratings[c] !== null);

  const submit = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data } = await assessmentService.submit({ mood: ratings.mood!, stress: ratings.stress!, energy: ratings.energy! });
      setDone({ recommendation: data.recommendation });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ASSESSMENT_NOT_YET_AVAILABLE') {
        // The first attempt may have reached the server even though its answer was lost; never record twice.
        setError('A check-in was already recorded for this period.');
        setReviewing(false);
      } else if (e instanceof ApiError && e.isNetwork) {
        setError('The connection dropped. Your answers are kept; check your connection and send again. If a check-in was already saved you will see it here.');
      } else setError(errorMessage(e));
    } finally {
      await Promise.all([client.invalidateQueries({ queryKey: ['assessments'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      locked.current = false;
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: spacing.md }} testID="checkin-done">
          <Text style={{ fontSize: 56 }}>✅</Text>
          <T variant="heading">Check-in recorded</T>
          <T variant="small" style={{ textAlign: 'center' }}>Thank you. Your check-in has been saved.</T>
        </Card>
        {done.recommendation ? <BreakRecommendationCard recommendation={done.recommendation} onRequested={() => void client.invalidateQueries({ queryKey: ['dashboard'] })} /> : null}
        <Button title="Back to home" onPress={() => router.replace('/(tabs)' as never)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Boundary query={status} skeleton={<SkeletonList count={3} height={130} />}>
        {(s) =>
          !s.canSubmit ? (
            <Card style={{ gap: spacing.md }} testID="checkin-locked">
              <T variant="subheading">Next check-in not available yet</T>
              <T variant="small">
                You can check in once every {describeHours(s.intervalHours)}. Your next check-in opens on <Text style={{ fontWeight: '700', color: colors.text }}>{formatDateTime(s.nextAvailableAt)}</Text>.
              </T>
              <Button title="Submit check-in" onPress={() => undefined} disabled />
            </Card>
          ) : reviewing ? (
            <>
              <Card testID="checkin-review">
                <T variant="subheading">Review your answers</T>
                {CATEGORIES.map((c) => (
                  <Row key={c} style={{ justifyContent: 'space-between', marginTop: spacing.md }}>
                    <T variant="body" style={{ fontWeight: '700' }}>{ratingScales[c].title}</T>
                    <T variant="body">{ratingOption(c, ratings[c]!).emoji} {ratings[c]}/5 · {ratingOption(c, ratings[c]!).label}</T>
                  </Row>
                ))}
              </Card>
              {error ? <Banner tone="danger" text={error} icon="alert-circle-outline" /> : null}
              <Button title="Submit check-in" onPress={submit} loading={busy} testID="checkin-submit" />
              <Button title="Change answers" variant="ghost" onPress={() => setReviewing(false)} disabled={busy} />
            </>
          ) : (
            <>
              <T variant="small">Mood, stress and energy together make one check-in. You can check in once every {describeHours(s.intervalHours)}.</T>
              {error ? <Banner tone="warning" text={error} icon="information-circle-outline" /> : null}
              {CATEGORIES.map((c) => (
                <RatingPicker key={c} category={c} value={ratings[c]} onChange={(v) => setRatings((r) => ({ ...r, [c]: v }))} />
              ))}
              <Button title="Review" onPress={() => setReviewing(true)} disabled={!complete} testID="checkin-review-btn" />
            </>
          )
        }
      </Boundary>
    </Screen>
  );
}

export default function CheckIn() {
  return (
    <RoleGate allow={['EMPLOYEE']}>
      <CheckInInner />
    </RoleGate>
  );
}
