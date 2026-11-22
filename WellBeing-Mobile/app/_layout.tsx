import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../src/api/client';
import { colors } from '../src/constants/theme';
import { roleHome } from '../src/lib/format';
import { PushBridge } from '../src/notifications/PushBridge';
import { useAuth } from '../src/store/auth';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// React Query follows the device's connectivity: while offline it pauses instead of failing.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      // Do not retry answers the server already gave (401/403/404/409/422/429); retry only dropped connections.
      retry: (count, error) => error instanceof ApiError && (error.isNetwork || error.status >= 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

function OfflineBar() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.warning, paddingTop: insets.top + 4, paddingBottom: 6, paddingHorizontal: 12 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
        You are offline. Changes are not saved until you reconnect.
      </Text>
    </View>
  );
}

/** Covers the screen while the app is in the background, so the OS app switcher never shows well-being data. */
function PrivacyCover() {
  const [hidden, setHidden] = useState(false);
  const signedIn = useAuth((s) => s.status === 'signedIn');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setHidden(state !== 'active'));
    return () => sub.remove();
  }, []);
  if (!hidden || !signedIn || Platform.OS === 'web') return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>WellBeing</Text>
    </View>
  );
}

/** Sends people to the right place: login when signed out, their role's home when signed in. */
function useAuthRedirect() {
  const status = useAuth((s) => s.status);
  const role = useAuth((s) => s.user?.role);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (status === 'loading') return;
    const first = String(segments[0] ?? '');
    const inAuth = first === '(auth)';
    if (status === 'signedOut' && !inAuth) router.replace('/login' as never);
    else if (status === 'signedIn' && role && (inAuth || first === '')) router.replace(roleHome[role] as never);
  }, [status, role, segments, router]);
}

function Shell() {
  const status = useAuth((s) => s.status);
  const restore = useAuth((s) => s.restore);
  useEffect(() => {
    void restore().finally(() => SplashScreen.hideAsync().catch(() => undefined));
  }, [restore]);
  useAuthRedirect();

  // Re-check the account whenever the app returns to the foreground (deactivated user, changed role, expired token).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useAuth.getState().status === 'signedIn') void useAuth.getState().refreshUser().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  return (
    <>
      <OfflineBar />
      {status === 'signedIn' ? <PushBridge /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="requests" options={{ title: 'Employee requests' }} />
        <Stack.Screen name="inbox" options={{ title: 'Notifications' }} />
        <Stack.Screen name="all-alerts" options={{ title: 'Well-Being Alerts' }} />
        <Stack.Screen name="my-meetings" options={{ title: 'My meetings' }} />
        <Stack.Screen name="check-in" options={{ title: 'Well-Being Check' }} />
        <Stack.Screen name="survey" options={{ title: 'OB Survey' }} />
        <Stack.Screen name="request/[id]" options={{ title: 'Request' }} />
        <Stack.Screen name="alert/[id]" options={{ title: 'Well-Being Alert' }} />
        <Stack.Screen name="meeting/[id]" options={{ title: 'Meeting' }} />
        <Stack.Screen name="team/[id]" options={{ title: 'Employee' }} />
        <Stack.Screen name="user/[id]" options={{ title: 'User' }} />
        <Stack.Screen name="user-new" options={{ title: 'Create user' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
        <Stack.Screen name="audit" options={{ title: 'Activity log' }} />
        <Stack.Screen name="survey-questions" options={{ title: 'Survey questions' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Shell />
        <PrivacyCover />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
