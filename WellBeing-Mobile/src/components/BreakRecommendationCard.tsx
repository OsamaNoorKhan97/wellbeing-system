import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { errorMessage } from '../api/client';
import { requestService } from '../api/services';
import { colors, radius, spacing } from '../constants/theme';
import { requestStatusLabels, requestTone, timeAgo } from '../lib/format';
import type { BreakRecommendation } from '../types';
import { Badge, Banner, Button, Row, T } from './ui';

/**
 * The supportive "take a break" suggestion shown while a well-being alert is open. It is only a suggestion:
 * the Line Manager still decides on the request, and the server prevents duplicate requests.
 */
export function BreakRecommendationCard({ recommendation, canRequest = true, onRequested }: { recommendation: BreakRecommendation; canRequest?: boolean; onRequested: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a successful request the card shows it as pending straight away, before any refetch.
  const [sent, setSent] = useState<BreakRecommendation['request']>(null);
  const request = sent ?? recommendation.request;
  const canAsk = !request || request.status === 'REJECTED' || request.status === 'CANCELLED';

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await requestService.create('BREAK', '', recommendation.alertId);
      setSent({ id: data.id, status: data.status, managerComment: data.managerComment });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      onRequested();
    }
  };

  return (
    <View testID="break-recommendation" style={{ backgroundColor: colors.warningSoft, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: '#F6D58A' }}>
      <Row>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="cafe" size={22} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="subheading" color="#78350F">A suggestion from your recent check-ins</T>
        </View>
      </Row>
      <T variant="body" color="#78350F">
        Your well-being matters! Based on your recent check-ins, you may benefit from taking a short break. Consider taking some time to recharge.
      </T>
      {request ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <T variant="small" color="#78350F">Your break request:</T>
          <Badge label={requestStatusLabels[request.status]} tone={requestTone(request.status)} />
          {request.managerComment ? <T variant="small" color="#78350F">“{request.managerComment}”</T> : null}
        </Row>
      ) : null}
      {!canRequest ? <T variant="small" color="#78350F">You have no Line Manager assigned yet. Please contact HR so a break can be requested.</T> : null}
      {error ? <Banner tone="danger" text={error} /> : null}
      {canAsk && canRequest ? <Button title="Request a Break" icon="cafe" onPress={ask} loading={busy} testID="request-break" /> : null}
      <T variant="caption">Suggested {timeAgo(recommendation.triggeredAt)}. This is a recommendation only; your Line Manager decides.</T>
    </View>
  );
}
