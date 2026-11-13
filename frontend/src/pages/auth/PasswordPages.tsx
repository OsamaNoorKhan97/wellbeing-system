import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../components/PasswordInput';
import { Alert, Button, Field, inputClass } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { authService } from '../../services';
import { AuthShell, linkClass } from './AuthShell';
import { validatePassword } from './RegisterPage';

const backToLogin = (
  <Link to="/login" className={linkClass}>
    Back to sign in
  </Link>
);

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim()) return setError('Enter your email or Employee ID');
    setError(null);
    setSubmitting(true);
    try {
      setResult((await authService.forgotPassword(identifier.trim())).data);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email or Employee ID and we will send reset instructions." footer={backToLogin}>
      {result ? (
        <div className="space-y-4">
          <Alert tone="success">{result.message}</Alert>
          {result.devResetUrl && (
            <Alert tone="info">
              <p className="font-medium">Development mode</p>
              <p className="mt-1">No mail server is configured, so the reset link is shown here instead of being emailed:</p>
              <a href={result.devResetUrl} className={`mt-2 block break-all ${linkClass}`}>
                {result.devResetUrl}
              </a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email or Employee ID" error={error ?? undefined}>
            {(props) => <input {...props} className={inputClass(error ?? undefined)} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus autoComplete="username" />}
          </Field>
          <Button type="submit" loading={submitting} className="w-full">
            Send reset instructions
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(useLocation().search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await authService.resetPassword({ token, password, confirmPassword });
      navigate('/login', { replace: true, state: { notice: 'Your password has been reset. You can now sign in.' } });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && Object.keys(error.fieldErrors).some((key) => key !== 'token')) setErrors(error.fieldErrors);
      else setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Reset link required" subtitle="Open the link from your password reset message." footer={backToLogin}>
        <Alert tone="warning">
          This page needs a valid reset link.{' '}
          <Link to="/forgot-password" className={linkClass}>
            Request a new one
          </Link>
          .
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed out of all other sessions." footer={backToLogin}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="New password" error={errors.password} hint="At least 8 characters, with a letter and a number">
          {(props) => <PasswordInput {...props} className={inputClass(errors.password)} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />}
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword}>
          {(props) => <PasswordInput {...props} className={inputClass(errors.confirmPassword)} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          Reset password
        </Button>
      </form>
    </AuthShell>
  );
}
