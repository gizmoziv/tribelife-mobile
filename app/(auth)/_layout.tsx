import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AuthLayout() {
  const router = useRouter();
  const { isAuthenticated, needsOnboarding, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && !needsOnboarding) {
      router.replace('/(app)/beacon');
    } else if (isAuthenticated && needsOnboarding) {
      router.replace('/(auth)/onboarding');
    }
  }, [isAuthenticated, needsOnboarding, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
