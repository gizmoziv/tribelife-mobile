import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useGlobeStore } from '@/store/globeStore';
import { useTheme } from '@/contexts/ThemeContext';
import { notificationsApi, globeApi } from '@/services/api';
import { getSocket, connectSocket } from '@/services/socket';
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

function GlobeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z"
        stroke={color}
        strokeWidth={1.5}
      />
      <Path
        d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"
        stroke={color}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5v14M5 12h14"
        stroke={color}
        strokeWidth={2}
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
  const { totalUnread, setUnreadCounts } = useGlobeStore();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/welcome');
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    const refetchNotifications = () => {
      notificationsApi
        .list()
        .then(({ notifications, unreadCount }) => {
          setNotifications(notifications, unreadCount);
        })
        .catch(() => {});
    };

    // Initial fetch on mount
    refetchNotifications();

    // Android aggressively kills sockets in background, so any notification:new
    // events emitted while the socket was disconnected are permanently lost.
    // Refetch from the server on foreground and on socket reconnect so the bell
    // always reflects server truth.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchNotifications();
    });

    let socketReconnectHandler: (() => void) | null = null;
    connectSocket().then(() => {
      const socket = getSocket();
      if (socket) {
        socketReconnectHandler = () => refetchNotifications();
        socket.io.on('reconnect', socketReconnectHandler);
      }
    });

    return () => {
      appStateSub.remove();
      if (socketReconnectHandler) {
        const socket = getSocket();
        socket?.io.off('reconnect', socketReconnectHandler);
      }
    };
  }, []);

  // Fetch Globe unread counts and listen for real-time globe messages
  useEffect(() => {
    globeApi
      .unread()
      .then(({ unread }) => setUnreadCounts(unread))
      .catch(() => {});

    let handler:
      | ((msg: { roomSlug?: string; roomId?: string }) => void)
      | null = null;
    connectSocket().then(() => {
      const socket = getSocket();
      if (socket) {
        handler = (msg: any) => {
          // Don't count own messages as unread
          const currentUserId = useAuthStore.getState().user?.id;
          if (msg.senderId === currentUserId) return;

          const slug = msg.roomSlug ?? msg.roomId?.replace('globe:', '');
          const activeSlug = useGlobeStore.getState().activeRoomSlug;
          if (slug && slug !== activeSlug) {
            useGlobeStore.getState().incrementUnread(slug);
          }
        };
        socket.on('globe:message', handler);
      }
    });

    return () => {
      if (handler) {
        const socket = getSocket();
        socket?.off('globe:message', handler);
      }
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: 'absolute',
          bottom: insets.bottom + 12,
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
          <View style={styles.headerRight}>
            {/* Globe icon moved to bottom nav between Chat and Beacon */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/(app)/group/create')}
              hitSlop={8}
            >
              <PlusIcon color={colors.textMuted} />
            </TouchableOpacity>
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
          </View>
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
        name="globe"
        options={{
          title: 'Globe',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="globe" color={color} focused={focused} />
          ),
          // Notification badge on the icon intentionally disabled per UX request
          // tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
          headerTitle: 'Globe',
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
      <Tabs.Screen
        name="group"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.page,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  bellButton: {
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
  globeBadge: {
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
