import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';

export default function GlobeLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: FONTS.semiBold, fontSize: 18 },
        headerShadowVisible: false,
      }}
    />
  );
}
