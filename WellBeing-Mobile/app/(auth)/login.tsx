import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { ApiError, errorMessage } from '../../src/api/client';
import { Banner, Button, Input, T } from '../../src/components/ui';
import { colors, spacing } from '../../src/constants/theme';
import { useAuth } from '../../src/store/auth';

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or Employee ID'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export default function Login() {
  const login = useAuth((s) => s.login);
  const notice = useAuth((s) => s.notice);
  const clearNotice = useAuth((s) => s.clearNotice);
  const [remember, setRemember] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { identifier: '', password: '' } });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    clearNotice();
    setBusy(true);
    try {
      await login(values.identifier, values.password, remember);
      // The root layout redirects to the role's home once the user is set.
    } catch (error) {
      setServerError(error instanceof ApiError && error.code === 'INVALID_CREDENTIALS' ? 'Incorrect email/ID or password.' : errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.primary }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="heart" size={36} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800' }}>WellBeing</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>Employee well-being, together</Text>
          </View>

          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: spacing.xl, gap: spacing.lg }}>
            <T variant="heading">Sign in</T>
            {notice ? <Banner tone="warning" text={notice} icon="information-circle-outline" /> : null}
            {serverError ? <Banner tone="danger" text={serverError} icon="alert-circle-outline" /> : null}
            <Controller
              control={control}
              name="identifier"
              render={({ field }) => (
                <Input label="Email or Employee ID" value={field.value} onChangeText={field.onChange} error={errors.identifier?.message} autoComplete="username" keyboardType="email-address" testID="login-identifier" />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <Input label="Password" secure value={field.value} onChangeText={field.onChange} error={errors.password?.message} autoComplete="current-password" onSubmitEditing={() => void submit()} testID="login-password" />
              )}
            />
            <Pressable onPress={() => setRemember((r) => !r)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
              <Ionicons name={remember ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
              <T variant="small" color={colors.text}>Keep me signed in on this device</T>
            </Pressable>
            <Button title="Sign in" onPress={() => void submit()} loading={busy} testID="login-submit" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Link href={'/forgot-password' as never} style={{ color: colors.primary, fontWeight: '700' }}>Forgot password?</Link>
              <Link href={'/register' as never} style={{ color: colors.primary, fontWeight: '700' }}>Create account</Link>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
