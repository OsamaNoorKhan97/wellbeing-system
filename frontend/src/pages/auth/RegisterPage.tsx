import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../components/PasswordInput';
import { Alert, Button, Field, inputClass } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { authService } from '../../services';
import { AuthShell, linkClass } from './AuthShell';

const emptyForm = { fullName: '', employeeId: '', email: '', department: '', designation: '', password: '', confirmPassword: '' };
type FormKey = keyof typeof emptyForm;

export function validatePassword(password: string): string | undefined {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use at least 8 characters with a letter and a number';
  return undefined;
}

function validate(form: typeof emptyForm): Partial<Record<FormKey, string>> {
  const errors: Partial<Record<FormKey, string>> = {};
  if (form.fullName.trim().length < 2) errors.fullName = 'Full name is required';
  if (form.employeeId.trim().length < 2) errors.employeeId = 'Employee ID is required';
  else if (!/^[A-Za-z0-9_-]+$/.test(form.employeeId.trim())) errors.employeeId = 'Use letters, numbers, hyphens or underscores only';
  if (!form.email.trim()) errors.email = 'Email address is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
  if (form.department.trim().length < 2) errors.department = 'Department is required';
  if (form.designation.trim().length < 2) errors.designation = 'Designation is required';
  const passwordError = validatePassword(form.password);
  if (passwordError) errors.password = passwordError;
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bind = (key: FormKey) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
    className: inputClass(errors[key]),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await authService.register(form);
      navigate('/login', { replace: true, state: { notice: 'Your account has been created. You can now sign in.' } });
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) setErrors(error.fieldErrors);
      else setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your employee account"
      subtitle="All fields are required."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Full name" error={errors.fullName}>
          {(props) => <input {...props} {...bind('fullName')} autoComplete="name" autoFocus />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID" error={errors.employeeId}>
            {(props) => <input {...props} {...bind('employeeId')} placeholder="EMP014" />}
          </Field>
          <Field label="Email address" error={errors.email}>
            {(props) => <input {...props} {...bind('email')} type="email" autoComplete="email" />}
          </Field>
          <Field label="Department" error={errors.department}>
            {(props) => <input {...props} {...bind('department')} placeholder="Engineering" />}
          </Field>
          <Field label="Designation" error={errors.designation}>
            {(props) => <input {...props} {...bind('designation')} placeholder="Software Engineer" />}
          </Field>
          <Field label="Password" error={errors.password} hint="At least 8 characters, with a letter and a number">
            {(props) => <PasswordInput {...props} {...bind('password')} autoComplete="new-password" />}
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword}>
            {(props) => <PasswordInput {...props} {...bind('confirmPassword')} autoComplete="new-password" />}
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          By creating an account you acknowledge the{' '}
          <Link to="/privacy" className={linkClass}>
            privacy notice
          </Link>
          , which explains who can see your data.
        </p>
        <Button type="submit" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
