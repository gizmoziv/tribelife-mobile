import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function ChatLayout() {
  const { colors } = useTheme();

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
          // Inline ChatHeader inside the screen (same pattern as
          // globe/[roomSlug].tsx + local). headerShown MUST be false at the
          // route level — otherwise the native header renders for a frame
          // during the iOS push transition (white flash + content jump) before
          // the in-screen <Stack.Screen headerShown:false> override applies.
          headerShown: false,
          presentation: 'card',
        }}
      />
      {/* [conversationId], local, and town-square all render their own inline
          custom headers (same pattern as globe/[roomSlug].tsx — CustomHeader),
          inheriting headerShown: false. */}
    </Stack>
  );
}
