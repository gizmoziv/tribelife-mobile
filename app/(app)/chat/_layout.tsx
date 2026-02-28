import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS } from '@/constants';

export default function ChatLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[conversationId]"
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: FONTS.semiBold },
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
