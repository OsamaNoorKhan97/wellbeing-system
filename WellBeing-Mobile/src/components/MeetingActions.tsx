import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '../api/client';
import { meetingService } from '../api/services';
import { colors, spacing, TOUCH } from '../constants/theme';
import { isActiveMeeting, type Meeting } from '../types';
import { DateTimeField } from './DateTimeField';
import { Banner, Button, ConfirmDialog, Input, Row, Sheet, T, type IconName } from './ui';

type Action = 'menu' | 'reschedule' | 'reject' | 'snooze' | 'cancel' | 'complete' | null;

const SNOOZES = [
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '1 day', minutes: 1440 },
];

function MenuItem({ icon, label, onPress, danger, testID }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
      <Ionicons name={icon} size={22} color={danger ? colors.danger : colors.primary} />
      <T variant="body" color={danger ? colors.danger : colors.text} style={{ fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
}

/**
 * The meeting Actions menu for a Line Manager: Reschedule, Reject, Snooze reminder, Cancel, Mark completed.
 * Snooze moves only the reminder; Reschedule keeps the previous time in the meeting history.
 */
export function MeetingActions({ meeting, onChanged }: { meeting: Meeting; onChanged?: () => void }) {
  const client = useQueryClient();
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [when, setWhen] = useState(() => new Date(Math.max(Date.now(), new Date(meeting.scheduledAt).getTime()) + 86_400_000));
  const [duration, setDuration] = useState(String(meeting.durationMinutes));
  const [custom, setCustom] = useState(() => new Date(Date.now() + 2 * 3_600_000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = isActiveMeeting(meeting.status);
  const close = () => {
    setAction(null);
    setReason('');
    setError(null);
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      close();
      await Promise.all([client.invalidateQueries({ queryKey: ['meetings'] }), client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['requests'] })]);
      onChanged?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!active) return null;
  return (
    <>
      <Button title="Actions" icon="ellipsis-horizontal-circle" variant="secondary" onPress={() => setAction('menu')} testID={`meeting-actions-${meeting.id}`} style={{ minHeight: 40 }} />

      <Sheet visible={action === 'menu'} onClose={close} title="Meeting actions">
        <MenuItem testID="act-reschedule" icon="calendar-outline" label="Reschedule" onPress={() => setAction('reschedule')} />
        <MenuItem testID="act-reject" icon="close-circle-outline" label="Reject" onPress={() => setAction('reject')} />
        <MenuItem testID="act-snooze" icon="alarm-outline" label="Snooze reminder" onPress={() => setAction('snooze')} />
        <MenuItem testID="act-complete" icon="checkmark-circle-outline" label="Mark as completed" onPress={() => setAction('complete')} />
        <MenuItem testID="act-cancel" icon="trash-outline" label="Cancel meeting" danger onPress={() => setAction('cancel')} />
      </Sheet>

      <Sheet visible={action === 'reschedule'} onClose={close} title="Reschedule meeting">
        <T variant="small">The current time ({new Date(meeting.scheduledAt).toLocaleString()}) stays in the meeting history. {meeting.employeeName} is notified.</T>
        <DateTimeField label="New date and time" value={when} onChange={setWhen} minimumDate={new Date()} testID="reschedule-when" />
        <Input label="Duration (minutes)" value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        <Input label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={500} autoCapitalize="sentences" testID="reschedule-reason" />
        {error ? <Banner tone="danger" text={error} /> : null}
        <Button
          title="Reschedule"
          loading={busy}
          testID="reschedule-confirm"
          onPress={() => run(() => meetingService.reschedule(meeting.id, { scheduledAt: when.toISOString(), durationMinutes: Number(duration) || meeting.durationMinutes, reason: reason.trim() || null }))}
        />
      </Sheet>

      <Sheet visible={action === 'snooze'} onClose={close} title="Snooze reminder">
        <T variant="small">Only your reminder is postponed. The meeting stays at {new Date(meeting.scheduledAt).toLocaleString()}. You get one reminder when the snooze ends.</T>
        {error ? <Banner tone="danger" text={error} /> : null}
        {SNOOZES.map((s) => (
          <Button key={s.minutes} title={s.label} variant="secondary" loading={busy} testID={`snooze-${s.minutes}`} onPress={() => run(() => meetingService.snooze(meeting.id, { minutes: s.minutes }))} />
        ))}
        <DateTimeField label="Custom date and time" value={custom} onChange={setCustom} minimumDate={new Date()} testID="snooze-custom-when" />
        <Button title="Snooze until custom time" loading={busy} testID="snooze-custom" onPress={() => run(() => meetingService.snooze(meeting.id, { until: custom.toISOString() }))} />
      </Sheet>

      <ConfirmDialog
        visible={action === 'reject'}
        title="Reject this meeting?"
        message={`${meeting.employeeName} will be notified that the meeting was rejected.`}
        confirmLabel="Reject meeting"
        destructive
        loading={busy}
        onCancel={close}
        onConfirm={() => run(() => meetingService.reject(meeting.id, reason.trim()))}
      >
        <Input label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={500} autoCapitalize="sentences" testID="reject-reason" />
        {error ? <Banner tone="danger" text={error} /> : null}
      </ConfirmDialog>

      <ConfirmDialog
        visible={action === 'cancel'}
        title="Cancel this meeting?"
        message={`${meeting.employeeName} will be notified. A linked discussion request goes back to Pending.`}
        confirmLabel="Cancel meeting"
        destructive
        loading={busy}
        onCancel={close}
        onConfirm={() => run(() => meetingService.cancel(meeting.id, reason.trim()))}
      >
        <Input label="Reason (optional)" value={reason} onChangeText={setReason} multiline maxLength={500} autoCapitalize="sentences" />
        {error ? <Banner tone="danger" text={error} /> : null}
      </ConfirmDialog>

      <ConfirmDialog
        visible={action === 'complete'}
        title="Mark as completed?"
        message="The meeting and its linked request will be marked completed."
        confirmLabel="Mark completed"
        loading={busy}
        onCancel={close}
        onConfirm={() => run(() => meetingService.complete(meeting.id))}
      >
        {error ? <Banner tone="danger" text={error} /> : null}
      </ConfirmDialog>
    </>
  );
}
