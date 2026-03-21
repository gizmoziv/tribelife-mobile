import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTheme } from '@/contexts/ThemeContext';
import { notificationsApi } from '@/services/api';
import { GradientTabIcon } from '@/components/ui/GradientTabIcon';
import { COLORS, FONTS, SHADOWS, RADIUS, SPACING } from '@/constants';
import Svg, { Path } from 'react-native-svg';

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { unreadCount, setNotifications } = useNotificationStore();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/welcome');
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    notificationsApi
      .list()
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications, unreadCount);
      })
      .catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          position: 'absolute',
          bottom: 12,
          left: SPACING.page,
          right: SPACING.page,
          backgroundColor: isDark
            ? 'rgba(15,20,35,0.92)'
            : 'rgba(255,255,255,0.92)',
          borderTopWidth: 0,
          borderRadius: RADIUS.xl,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          ...SHADOWS.lg,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: FONTS.medium,
          fontSize: 10,
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.background,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontFamily: FONTS.semiBold,
          fontSize: 18,
        },
        headerRight: () => (
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => router.push('/notifications')}
          >
            <BellIcon color={colors.textMuted} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="chat" color={color} focused={focused} />
          ),
          headerTitle: 'Chat',
        }}
      />
      <Tabs.Screen
        name="beacon"
        options={{
          title: 'Beacon',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="beacon" color={color} focused={focused} />
          ),
          headerTitle: 'Beacon',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="profile" color={color} focused={focused} />
          ),
          headerTitle: 'My Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    marginRight: SPACING.page,
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -2,
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.pill,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: FONTS.bold,
  },
});
