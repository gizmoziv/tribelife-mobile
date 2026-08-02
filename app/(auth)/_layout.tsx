import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AuthLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, needsOnboarding, isLoading } = useAuthStore();

  // Phase 35: needsOnboarding and accessStatus are independent flags — a
  // user filling out the apply-for-access form still has needsOnboarding
  // === true. Without this guard the unguarded redirect below bounces them
  // straight back to onboarding out from under the apply form.
  const onOnboardingFlow = segments.includes('onboarding') || segments.includes('apply-for-access');

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && !needsOnboarding) {
      router.replace('/(app)/beacon');
    } else if (isAuthenticated && needsOnboarding && !onOnboardingFlow) {
      router.replace('/(auth)/onboarding');
    }
  }, [isAuthenticated, needsOnboarding, isLoading, onOnboardingFlow]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="apply-for-access" />
    </Stack>
  );
}
