import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ApiError, errorMessage } from '../src/api/client';
import { authService } from '../src/api/services';
import { Banner, Button, Input, Screen, T } from '../src/components/ui';
import { useAuth } from '../src/store/auth';

export default function ChangePassword() {
  const router = useRouter();
  const replaceToken = useAuth((s) => s.replaceToken);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setFields({});
    setError(null);
    if (password !== confirm) return setFields({ confirmPassword: 'Passwords do not match' });
    setBusy(true);
    try {
      const { data } = await authService.changePassword({ currentPassword: current, password, confirmPassword: confirm });
      await replaceToken(data.token);
      setOk(true);
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fieldErrors);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="small">Use at least 8 characters with a letter and a number. Other devices are signed out.</T>
      {ok ? <Banner tone="success" text="Password changed." icon="checkmark-circle-outline" /> : null}
      {error ? <Banner tone="danger" text={error} icon="alert-circle-outline" /> : null}
      <Input label="Current password" secure value={current} onChangeText={setCurrent} error={fields.currentPassword} testID="cp-current" />
      <Input label="New password" secure value={password} onChangeText={setPassword} error={fields.password} testID="cp-new" />
      <Input label="Confirm new password" secure value={confirm} onChangeText={setConfirm} error={fields.confirmPassword} testID="cp-confirm" />
      <Button title="Change password" onPress={submit} loading={busy} testID="cp-save" />
      {ok ? <Button title="Done" variant="secondary" onPress={() => router.back()} /> : null}
    </Screen>
  );
}
