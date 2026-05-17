import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function UShortcut() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return null;
  if (!handle || !isAuthenticated) return <Redirect href="/" />;
  return <Redirect href={`/user/${handle}`} />;
}
