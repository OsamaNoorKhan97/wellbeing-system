import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, errorMessage } from '../../src/api/client';
import { authService } from '../../src/api/services';
import { Banner, Button, Input, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth';

const password = z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number');
const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    employeeId: z.string().trim().min(2, 'Enter your Employee ID'),
    email: z.string().trim().email('Enter a valid email address'),
    department: z.string().trim().min(1, 'Enter your department'),
    designation: z.string().trim().min(1, 'Enter your designation'),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
type Form = z.infer<typeof schema>;

const FIELDS: { name: keyof Form; label: string; secure?: boolean; keyboard?: 'email-address' }[] = [
  { name: 'fullName', label: 'Full name' },
  { name: 'employeeId', label: 'Employee ID' },
  { name: 'email', label: 'Email', keyboard: 'email-address' },
  { name: 'department', label: 'Department' },
  { name: 'designation', label: 'Designation' },
  { name: 'password', label: 'Password', secure: true },
  { name: 'confirmPassword', label: 'Confirm password', secure: true },
];

export default function Register() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { control, handleSubmit, setError, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', employeeId: '', email: '', department: '', designation: '', password: '', confirmPassword: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    setBusy(true);
    try {
      await authService.register(values);
      await login(values.email, values.password, true);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) setError(field as keyof Form, { message });
      }
      setServerError(errorMessage(error));
      if (!router.canGoBack()) router.replace('/login' as never);
    } finally {
      setBusy(false);
    }
  });

  return (
    <Screen>
      <Banner tone="info" text="Create an employee account. Line Managers and HR accounts are created by an administrator." icon="information-circle-outline" />
      {serverError ? <Banner tone="danger" text={serverError} icon="alert-circle-outline" /> : null}
      {FIELDS.map((f) => (
        <Controller
          key={f.name}
          control={control}
          name={f.name}
          render={({ field }) => (
            <Input label={f.label} secure={f.secure} keyboardType={f.keyboard} autoCapitalize={f.name === 'fullName' || f.name === 'designation' || f.name === 'department' ? 'words' : 'none'} value={field.value} onChangeText={field.onChange} error={errors[f.name]?.message} />
          )}
        />
      ))}
      <Button title="Create account" onPress={() => void submit()} loading={busy} />
    </Screen>
  );
}
