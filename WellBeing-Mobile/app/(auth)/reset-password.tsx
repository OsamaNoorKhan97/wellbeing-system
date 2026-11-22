import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../../src/api/client';
import { authService } from '../../src/api/services';
import { Banner, Button, Input, Screen, T } from '../../src/components/ui';

export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    setFields({});
    if (password !== confirm) return setFields({ confirmPassword: 'Passwords do not match' });
    setBusy(true);
    try {
      await authService.resetPassword({ token: token.trim(), password, confirmPassword: confirm });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fieldErrors);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Banner tone="success" text="Your password was changed. Sign in with the new password." icon="checkmark-circle-outline" />
        <Button title="Go to sign in" onPress={() => router.replace('/login' as never)} />
      </Screen>
    );
  }
  return (
    <Screen>
      <T variant="small">Paste the reset token from your email and choose a new password (8+ characters with a letter and a number).</T>
      {error ? <Banner tone="danger" text={error} icon="alert-circle-outline" /> : null}
      <Input label="Reset token" value={token} onChangeText={setToken} error={fields.token} />
      <Input label="New password" secure value={password} onChangeText={setPassword} error={fields.password} />
      <Input label="Confirm new password" secure value={confirm} onChangeText={setConfirm} error={fields.confirmPassword} />
      <Button title="Reset password" onPress={submit} loading={busy} />
    </Screen>
  );
}
