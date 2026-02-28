import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '@/constants';

export default function Index() {
  const { isAuthenticated, needsOnboarding, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isAuthenticated && !needsOnboarding) {
    return <Redirect href="/(app)/beacon" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
