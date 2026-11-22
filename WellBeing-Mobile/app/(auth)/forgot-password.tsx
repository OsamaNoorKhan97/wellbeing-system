import { useRouter } from 'expo-router';
import { useState } from 'react';
import { errorMessage } from '../../src/api/client';
import { authService } from '../../src/api/services';
import { Banner, Button, Input, Screen, T } from '../../src/components/ui';

export default function ForgotPassword() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; token?: string } | null>(null);

  const submit = async () => {
    if (!identifier.trim()) return setError('Enter your email or Employee ID');
    setBusy(true);
    setError(null);
    try {
      const { data } = await authService.forgotPassword(identifier.trim());
      // Outside production the server returns the reset link so it can be tested without a mail server.
      const token = data.devResetUrl ? new URL(data.devResetUrl).searchParams.get('token') ?? data.devResetUrl.split('/').pop() ?? undefined : undefined;
      setDone({ message: data.message, token });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="small">Enter your email or Employee ID. If an account exists, a reset link is sent to its email address.</T>
      {error ? <Banner tone="danger" text={error} icon="alert-circle-outline" /> : null}
      {done ? <Banner tone="success" text={done.message} icon="checkmark-circle-outline" /> : null}
      <Input label="Email or Employee ID" value={identifier} onChangeText={setIdentifier} keyboardType="email-address" />
      <Button title="Send reset link" onPress={submit} loading={busy} />
      {done?.token ? <Button title="Enter the reset token" variant="secondary" onPress={() => router.push({ pathname: '/reset-password', params: { token: done.token } } as never)} /> : null}
      <Button title="I already have a reset token" variant="ghost" onPress={() => router.push('/reset-password' as never)} />
    </Screen>
  );
}
