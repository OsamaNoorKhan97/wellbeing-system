import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ApiError, errorMessage } from '../../src/api/client';
import { settingsService } from '../../src/api/services';
import { RoleGate } from '../../src/components/RoleGate';
import { Banner, Button, Card, Chips, Input, Row, Screen, SectionHeader, SkeletonList, T } from '../../src/components/ui';
import { colors } from '../../src/constants/theme';
import { Boundary, useApi, useRefresh } from '../../src/hooks/useData';
import { describeHours } from '../../src/lib/format';
import type { AppSetting } from '../../src/types';

const HOUR_PRESETS = ['12', '24', '48', '72'];
const DAY_PRESETS = ['7', '15', '30', '45', '60'];

function Toggle({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <Ionicons name={value ? 'toggle' : 'toggle-outline'} size={36} color={value ? colors.primary : colors.textMuted} />
      <T variant="body" style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

/** A frequency control: quick presets plus a custom number. */
function Frequency({ value, onChange, presets, unit, testID }: { value: string; onChange: (v: string) => void; presets: string[]; unit: string; testID: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Chips value={presets.includes(value) ? value : 'custom'} onChange={(v) => v !== 'custom' && onChange(v)} options={[...presets.map((p) => ({ value: p, label: `${p} ${unit}` })), { value: 'custom', label: 'Custom' }]} />
      <Input label={`Custom (${unit})`} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, ''))} keyboardType="number-pad" testID={testID} />
    </View>
  );
}

function Inner() {
  const router = useRouter();
  const client = useQueryClient();
  const query = useApi(['settings'], () => settingsService.list());
  const { refreshing, onRefresh } = useRefresh(query.refetch);
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ section: string; tone: 'success' | 'danger'; text: string } | null>(null);
  // Keys the user has edited but not saved yet: a background refresh must never overwrite those.
  const dirty = useRef(new Set<string>());

  useEffect(() => {
    if (!query.data) return;
    setV((current) => {
      const next: Record<string, string> = {};
      for (const s of query.data as AppSetting[]) next[s.key] = dirty.current.has(s.key) ? current[s.key] ?? s.value : s.value;
      return next;
    });
  }, [query.data]);
  const set = (k: string) => (val: string) => {
    dirty.current.add(k);
    setV((x) => ({ ...x, [k]: val }));
  };
  const flag = (k: string) => v[k] === 'true';

  const save = async (name: string, keys: string[]) => {
    setSaving(name);
    setMsg(null);
    try {
      const body: Record<string, string | number> = {};
      for (const k of keys) body[k] = v[k]!;
      await settingsService.update(body);
      for (const k of keys) dirty.current.delete(k);
      await client.invalidateQueries({ queryKey: ['settings'] });
      await client.invalidateQueries({ queryKey: ['assessments'] });
      await client.invalidateQueries({ queryKey: ['survey'] });
      setMsg({ section: name, tone: 'success', text: `${name} saved. It applies to every employee immediately, on web and mobile.` });
    } catch (e) {
      const detail = e instanceof ApiError ? Object.values(e.fieldErrors)[0] : undefined;
      setMsg({ section: name, tone: 'danger', text: detail ?? errorMessage(e) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Boundary query={query} skeleton={<SkeletonList count={3} height={150} />}>
        {() => (
          <>
            <Card style={{ gap: 10 }} testID="cfg-assessment">
              <T variant="subheading">Well-being assessment frequency</T>
              <T variant="small">Mood, stress and energy are one assessment. Currently every {describeHours(Number(v.assessment_interval_hours ?? 24))}. Default: 24 hours.</T>
              <Frequency value={v.assessment_interval_hours ?? ''} onChange={set('assessment_interval_hours')} presets={HOUR_PRESETS} unit="hours" testID="cfg-interval" />
              {msg?.section === 'Assessment frequency' ? <Banner tone={msg.tone} text={msg.text} icon={msg.tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} /> : null}
              <Button title="Save assessment frequency" loading={saving === 'Assessment frequency'} onPress={() => save('Assessment frequency', ['assessment_interval_hours'])} testID="cfg-interval-save" />
            </Card>

            <Card style={{ gap: 10 }} testID="cfg-survey">
              <T variant="subheading">Organizational Behavior survey frequency</T>
              <T variant="small">Currently every {v.survey_frequency_days ?? '30'} days. Default: 30 days.</T>
              <Frequency value={v.survey_frequency_days ?? ''} onChange={set('survey_frequency_days')} presets={DAY_PRESETS} unit="days" testID="cfg-survey-days" />
              {msg?.section === 'Survey frequency' ? <Banner tone={msg.tone} text={msg.text} icon={msg.tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} /> : null}
              <Button title="Save survey frequency" loading={saving === 'Survey frequency'} onPress={() => save('Survey frequency', ['survey_frequency_days'])} testID="cfg-survey-save" />
            </Card>

            <Card style={{ gap: 10 }} testID="cfg-alerts">
              <T variant="subheading">Well-being alerts</T>
              <T variant="small">An assessment counts as poor when enough indicators cross their thresholds. An alert is raised after the chosen number of consecutive poor assessments.</T>
              <Input label="Mood is poor at or below (1–5)" value={v.alert_mood_threshold ?? ''} onChangeText={set('alert_mood_threshold')} keyboardType="number-pad" testID="cfg-mood" />
              <Input label="Stress is poor at or above (1–5)" value={v.alert_stress_threshold ?? ''} onChangeText={set('alert_stress_threshold')} keyboardType="number-pad" testID="cfg-stress" />
              <Input label="Energy is poor at or below (1–5)" value={v.alert_energy_threshold ?? ''} onChangeText={set('alert_energy_threshold')} keyboardType="number-pad" testID="cfg-energy" />
              <Input label="Poor indicators required per assessment (1–3)" value={v.alert_indicators_required ?? ''} onChangeText={set('alert_indicators_required')} keyboardType="number-pad" testID="cfg-indicators" />
              <Input label="Consecutive poor assessments to alert" value={v.alert_consecutive_required ?? ''} onChangeText={set('alert_consecutive_required')} keyboardType="number-pad" testID="cfg-consecutive" />
              {msg?.section === 'Alert settings' ? <Banner tone={msg.tone} text={msg.text} icon={msg.tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} /> : null}
              <Button title="Save alert settings" loading={saving === 'Alert settings'} onPress={() => save('Alert settings', ['alert_mood_threshold', 'alert_stress_threshold', 'alert_energy_threshold', 'alert_indicators_required', 'alert_consecutive_required'])} testID="cfg-alerts-save" />
            </Card>

            <Card style={{ gap: 6 }} testID="cfg-notify">
              <T variant="subheading">Who is notified about alerts</T>
              <Toggle label="Line Manager of the employee" value={flag('alert_notify_line_manager')} onChange={(x) => set('alert_notify_line_manager')(String(x))} testID="cfg-notify-lm" />
              <Toggle label="All HR users" value={flag('alert_notify_hr')} onChange={(x) => set('alert_notify_hr')(String(x))} testID="cfg-notify-hr" />
              {msg?.section === 'Notification recipients' ? <Banner tone={msg.tone} text={msg.text} icon={msg.tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} /> : null}
              <Button title="Save notification recipients" loading={saving === 'Notification recipients'} onPress={() => save('Notification recipients', ['alert_notify_line_manager', 'alert_notify_hr'])} testID="cfg-notify-save" />
            </Card>

            <Card style={{ gap: 10 }}>
              <T variant="subheading">Reporting privacy</T>
              <Input label="Minimum group size for averages" value={v.analytics_min_group_size ?? ''} onChangeText={set('analytics_min_group_size')} keyboardType="number-pad" hint="Groups smaller than this show no averages." />
              {msg?.section === 'Privacy setting' ? <Banner tone={msg.tone} text={msg.text} icon={msg.tone === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} /> : null}
              <Button title="Save" variant="secondary" loading={saving === 'Privacy setting'} onPress={() => save('Privacy setting', ['analytics_min_group_size'])} />
            </Card>

            <SectionHeader title="More" />
            <Card onPress={() => router.push('/survey-questions' as never)}>
              <Row><Ionicons name="list" size={22} color={colors.primary} /><T variant="body" style={{ flex: 1, fontWeight: '700' }}>Survey questions</T><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Row>
            </Card>
            <Card onPress={() => router.push('/audit' as never)}>
              <Row><Ionicons name="document-text" size={22} color={colors.primary} /><T variant="body" style={{ flex: 1, fontWeight: '700' }}>Activity log</T><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Row>
            </Card>
          </>
        )}
      </Boundary>
    </Screen>
  );
}

export default function Settings() {
  return (
    <RoleGate allow={['SUPER_ADMIN']}>
      <Inner />
    </RoleGate>
  );
}
