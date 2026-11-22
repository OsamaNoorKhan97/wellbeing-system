import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, radius, shadow, spacing, TOUCH } from '../constants/theme';
import type { Tone } from '../lib/format';
import { ApiError } from '../api/client';

export type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ text */

export function T({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  testID,
}: {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'subheading' | 'body' | 'small' | 'caption';
  color?: string;
  style?: object;
  numberOfLines?: number;
  testID?: string;
}) {
  return (
    <Text testID={testID} numberOfLines={numberOfLines} style={[textStyles[variant], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}
const textStyles = StyleSheet.create({
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.text },
  heading: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  subheading: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  body: { fontSize: font.md, color: colors.text, lineHeight: 21 },
  small: { fontSize: font.sm, color: colors.textMuted, lineHeight: 18 },
  caption: { fontSize: font.xs, color: colors.textMuted },
});

/* ---------------------------------------------------------------- layout */

/** A screen body: safe areas, keyboard handling, pull-to-refresh. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  padded = true,
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && { padding: spacing.lg, paddingBottom: spacing.xxl }, { gap: spacing.md }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: spacing.lg }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, testID }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; testID?: string }) {
  const content = (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {content}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }, style]}>{children}</View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
      <T variant="subheading">{title}</T>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link">
          <T variant="small" color={colors.primary} style={{ fontWeight: '700' }}>{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- buttons */

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: ViewStyle;
  testID?: string;
}) {
  const inactive = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
    secondary: { bg: colors.card, fg: colors.primary, border: colors.primary },
    danger: { bg: colors.danger, fg: '#fff', border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
      <Text style={{ color: palette.fg, fontSize: font.md, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = colors.text, badge }: { icon: IconName; onPress: () => void; label: string; color?: string; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.iconButton}>
      <Ionicons name={icon} size={24} color={color} />
      {badge ? (
        <View style={styles.badgeDot}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- forms */

export function Input({
  label,
  error,
  secure,
  hint,
  ...rest
}: TextInputProps & { label: string; error?: string; secure?: boolean; hint?: string }) {
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text }}>{label}</Text>
      <View style={[styles.inputWrap, error ? { borderColor: colors.danger } : null]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#94A3A2"
          style={styles.input}
          secureTextEntry={secure && hidden}
          autoCapitalize="none"
          {...rest}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={{ color: colors.danger, fontSize: font.xs }}>{error}</Text> : hint ? <T variant="caption">{hint}</T> : null}
    </View>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: active ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: font.sm }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Text style={{ color: active ? '#fff' : colors.text, fontSize: font.sm, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------------------------------------------------------------- badges */

const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutralSoft, fg: colors.textMuted },
  info: { bg: colors.infoSoft, fg: colors.info },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: font.xs, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  );
}

export function StatCard({ label, value, icon, tone = 'info', onPress }: { label: string; value: string | number; icon: IconName; tone?: Tone; onPress?: () => void }) {
  const c = toneColors[tone];
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: '45%', gap: 6 }} testID={`stat-${label}`}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={c.fg} />
      </View>
      <Text style={{ fontSize: font.xl, fontWeight: '800', color: colors.text }}>{value}</Text>
      <T variant="small">{label}</T>
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>{children}</View>;
}

/* ---------------------------------------------------------------- states */

export function Skeleton({ height = 80, style }: { height?: number; style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View testID="skeleton" style={[{ height, borderRadius: radius.md, backgroundColor: colors.border, opacity }, style]} />;
}

export function SkeletonList({ count = 3, height = 84 }: { count?: number; height?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </View>
  );
}

export function Empty({ icon = 'leaf-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <T variant="subheading" style={{ textAlign: 'center' }}>{title}</T>
      {message ? <T variant="small" style={{ textAlign: 'center' }}>{message}</T> : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.isNetwork;
  return (
    <View testID="error-state" style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
      <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={40} color={colors.danger} />
      <T variant="subheading" style={{ textAlign: 'center' }}>{offline ? 'You appear to be offline' : 'Something went wrong'}</T>
      <T variant="small" style={{ textAlign: 'center' }}>{error instanceof Error ? error.message : 'Please try again.'}</T>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function Banner({ tone = 'info', text, icon }: { tone?: Tone; text: string; icon?: IconName }) {
  const c = toneColors[tone];
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: spacing.sm, backgroundColor: c.bg, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' }}>
      {icon ? <Ionicons name={icon} size={18} color={c.fg} /> : null}
      <Text style={{ color: c.fg, flex: 1, fontSize: font.sm, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- dialogs */

/** Bottom sheet used for forms and menus. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <T variant="subheading">{title}</T>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Cross-platform confirmation dialog (Alert.alert does not exist on the web build used for tests). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl }}>
        <View style={[styles.card, { gap: spacing.md, padding: spacing.xl }]} accessibilityViewIsModal>
          <T variant="subheading">{title}</T>
          {message ? <T variant="small">{message}</T> : null}
          {children}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={loading} />
            <Button title={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} testID="confirm-dialog-confirm" />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  left,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Card onPress={onPress} testID={testID}>
      <Row>
        {left}
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>{title}</T>
          {subtitle ? <T variant="small" numberOfLines={2}>{subtitle}</T> : null}
        </View>
        {right}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow },
  button: { minHeight: TOUCH, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  inputWrap: { minHeight: TOUCH, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', gap: 8 },
  input: { flex: 1, fontSize: font.md, color: colors.text, paddingVertical: 10 },
  segmented: { flexDirection: 'row', backgroundColor: colors.neutralSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
});
