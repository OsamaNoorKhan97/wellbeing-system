import { Redirect } from 'expo-router';
import { roleHome } from '../src/lib/format';
import { useAuth } from '../src/store/auth';

/** Entry point: the auth gate in the root layout decides; this just avoids a blank route. */
export default function Index() {
  const user = useAuth((s) => s.user);
  return <Redirect href={(user ? roleHome[user.role] : '/login') as never} />;
}
