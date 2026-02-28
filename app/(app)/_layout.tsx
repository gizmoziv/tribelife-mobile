import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useTheme } from '@/contexts/ThemeContext';
import { notificationsApi } from '@/services/api';
import { LighthouseIcon } from '@/components/ui/LighthouseIcon';
import { COLORS, FONTS } from '@/constants';

// Simple SVG-based tab icons
function ChatIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>💬</Text>
    </View>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>👤</Text>
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { unreadCount, setNotifications } = useNotificationStore();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/welcome');
    }
  }, [isAuthenticated, isLoading]);

  // Fetch notifications on mount
  useEffect(() => {
    notificationsApi.list().then(({ notifications, unreadCount }) => {
      setNotifications(notifications, unreadCount);
    }).catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: isDark ? COLORS.surface : COLORS.lightSurface,
          borderTopColor: isDark ? COLORS.border : COLORS.lightBorder,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: isDark ? COLORS.textMuted : COLORS.lightTextMuted,
        tabBarLabelStyle: {
          fontFamily: FONTS.medium,
          fontSize: 11,
        },
        headerStyle: {
          backgroundColor: isDark ? COLORS.surface : COLORS.lightSurface,
        },
        headerTintColor: isDark ? COLORS.text : COLORS.lightText,
        headerTitleStyle: {
          fontFamily: FONTS.semiBold,
        },
        headerRight: () => (
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => router.push('/notifications')}
          >
            <Text style={styles.bellIcon}>🔔</Text>
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
          tabBarIcon: ({ color }) => <ChatIcon color={color} />,
          headerTitle: 'Chat',
        }}
      />
      <Tabs.Screen
        name="beacon"
        options={{
          title: 'Beacon',
          tabBarIcon: ({ color, focused }) => (
            <LighthouseIcon color={color} focused={focused} />
          ),
          headerTitle: 'Beacon',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
          headerTitle: 'My Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    marginRight: 16,
    position: 'relative',
  },
  bellIcon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: FONTS.bold,
  },
});
