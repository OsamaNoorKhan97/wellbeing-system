import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { createElement, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { colors, font, radius, spacing, TOUCH } from '../constants/theme';
import { formatDateTime } from '../lib/format';
import { Button, Sheet } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Native date and time picker. Android shows the system date dialog followed by the time dialog,
 * iOS shows a spinner sheet, and the browser build (used for automated tests) uses a datetime-local input.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
  testID,
}: {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  testID?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      onChange: (event, picked) => {
        if (event.type !== 'set' || !picked) return;
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            const next = new Date(picked);
            next.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(next);
          },
        });
      },
    });
  };

  const open = () => {
    if (Platform.OS === 'android') return openAndroid();
    setDraft(value);
    setIosOpen(true);
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text }}>{label}</Text>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'datetime-local',
          'data-testid': testID,
          'aria-label': label,
          value: toLocalInput(value),
          min: minimumDate ? toLocalInput(minimumDate) : undefined,
          onChange: (e: { target: { value: string } }) => {
            const d = new Date(e.target.value);
            if (!Number.isNaN(d.getTime())) onChange(d);
          },
          style: { minHeight: TOUCH, border: `1.5px solid ${colors.border}`, borderRadius: radius.md, padding: '0 12px', fontSize: font.md, fontFamily: 'inherit' },
        })
      ) : (
        <Pressable
          testID={testID}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${formatDateTime(value.toISOString())}`}
          style={{ minHeight: TOUCH, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff' }}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={{ fontSize: font.md, color: colors.text }}>{formatDateTime(value.toISOString())}</Text>
        </Pressable>
      )}
      {Platform.OS === 'ios' ? (
        <Sheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label}>
          <DateTimePicker value={draft} mode="datetime" display="spinner" minimumDate={minimumDate} onChange={(_, d) => d && setDraft(d)} />
          <Button
            title="Done"
            onPress={() => {
              onChange(draft);
              setIosOpen(false);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}
