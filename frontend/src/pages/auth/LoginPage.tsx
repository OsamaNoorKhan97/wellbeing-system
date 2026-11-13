import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../components/PasswordInput';
import { Alert, Button, Field, inputClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { ApiError, errorMessage } from '../../lib/api';
import { roleHome } from '../../lib/format';
import { AuthShell, linkClass } from './AuthShell';

export function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { from?: string; notice?: string };

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!identifier.trim()) next.identifier = 'Enter your email or Employee ID';
    if (!password) next.password = 'Enter your password';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const user = await login(identifier.trim(), password, rememberMe);
      const home = roleHome[user.role];
      navigate(state.from?.startsWith(home) ? state.from : home, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.fieldErrors);
      else setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use your work email or Employee ID."
      footer={
        <>
          New employee?{' '}
          <Link to="/register" className={linkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {state.notice && <Alert tone="success">{state.notice}</Alert>}
        {sessionExpired && !formError && <Alert tone="warning">Your session has ended. Please sign in again.</Alert>}
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field label="Email or Employee ID" error={errors.identifier}>
          {(props) => (
            <input {...props} className={inputClass(errors.identifier)} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus placeholder="name@company.com or EMP001" />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(props) => <PasswordInput {...props} className={inputClass(errors.password)} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
        </Field>

        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-slate-600">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-brand-700" />
            Remember me
          </label>
          <Link to="/forgot-password" className={linkClass}>
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
