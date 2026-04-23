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
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore, selectBellCount } from '@/store/notificationStore';
import { useGlobeStore } from '@/store/globeStore';
import { useChatUnreadStore } from '@/store/chatUnreadStore';
import { useLocalChatUnreadStore } from '@/store/localChatUnreadStore';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { useTheme } from '@/contexts/ThemeContext';
import { notificationsApi, globeApi, chat } from '@/services/api';
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
  const { isAuthenticated, needsOnboarding, isLoading } = useAuthStore();
  const { setNotifications, setSummary } = useNotificationStore();
  const bellCount = useNotificationStore(selectBellCount);

  // Sync the app icon badge count to the bell event count (not raw message
  // count) so a chatty thread can't inflate the OS badge past the real
  // signal value. Clears automatically as the user catches up.
  useEffect(() => {
    Notifications.setBadgeCountAsync(bellCount).catch(() => {});
  }, [bellCount]);
  const { totalUnread, setUnreadCounts } = useGlobeStore();
  const chatTotalUnread = useChatUnreadStore((s) => s.totalUnread);
  const localChatUnread = useLocalChatUnreadStore((s) => s.unread);
  const chatTabBadge = chatTotalUnread + localChatUnread;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/welcome');
    } else if (needsOnboarding) {
      router.replace('/(auth)/onboarding');
    }
  }, [isAuthenticated, needsOnboarding, isLoading]);

  useEffect(() => {
    const refetchNotifications = () => {
      notificationsApi
        .list()
        .then(({ notifications, unreadCount }) => {
          setNotifications(notifications, unreadCount);
        })
        .catch(() => {});
      notificationsApi
        .summary()
        .then(setSummary)
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

  // Keep the Chat tab aggregate badge in sync with server unread. This must
  // live in the tab layout (not the chat list screen) because the user may
  // be on another tab when a DM arrives — the chat list screen's own refetch
  // wouldn't run, and the badge would stay stale until they switched tabs.
  useEffect(() => {
    const refetchChatUnread = () => {
      chat.getConversations()
        .then(({ conversations }) => {
          const total = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
          useChatUnreadStore.getState().setTotalUnread(total);
        })
        .catch(() => {});
    };

    refetchChatUnread();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchChatUnread();
    });

    let cleanupSocket: (() => void) | null = null;
    connectSocket().then(() => {
      const socket = getSocket();
      if (!socket) return;
      const onDm = () => refetchChatUnread();
      const onReconnect = () => refetchChatUnread();
      socket.on('dm:message', onDm);
      socket.on('notification:new', onDm);
      socket.io.on('reconnect', onReconnect);
      cleanupSocket = () => {
        socket.off('dm:message', onDm);
        socket.off('notification:new', onDm);
        socket.io.off('reconnect', onReconnect);
      };
    });

    return () => {
      appStateSub.remove();
      cleanupSocket?.();
    };
  }, []);

  // Local (timezone) chat unread fan-out. Every user auto-joins their
  // timezone socket room on connect, so `room:message` already reaches them
  // regardless of which tab they're on — we just need to translate that into
  // a bubble on the Chat tab when they aren't actively viewing Local Chat.
  useEffect(() => {
    let handler: ((msg: { senderId?: number; roomId?: string }) => void) | null = null;
    connectSocket().then(() => {
      const socket = getSocket();
      if (!socket) return;
      handler = (msg) => {
        const currentUserId = useAuthStore.getState().user?.id;
        if (msg.senderId === currentUserId) return;
        const ctx = useForegroundContextStore.getState().context;
        if (ctx.type === 'localChat') return;
        useLocalChatUnreadStore.getState().increment();
      };
      socket.on('room:message', handler);
    });
    return () => {
      if (handler) {
        const socket = getSocket();
        socket?.off('room:message', handler);
      }
    };
  }, []);

  // Fetch Globe unread counts and listen for real-time globe messages
  useEffect(() => {
    globeApi
      .unread()
      .then(({ unread }) => setUnreadCounts(unread))
      .catch(() => {});

    let messageHandler:
      | ((msg: { roomSlug?: string; roomId?: string; senderId?: number }) => void)
      | null = null;
    let signalHandler:
      | ((sig: { slug?: string; roomId?: string; senderId?: number }) => void)
      | null = null;
    connectSocket().then(() => {
      const socket = getSocket();
      if (!socket) return;

      const incrementForSlug = (slug: string | undefined, senderId: number | undefined) => {
        if (!slug) return;
        const currentUserId = useAuthStore.getState().user?.id;
        if (senderId === currentUserId) return;
        const activeSlug = useGlobeStore.getState().activeRoomSlug;
        if (slug === activeSlug) return;
        useGlobeStore.getState().incrementUnread(slug);
      };

      messageHandler = (msg: any) => {
        const slug = msg.roomSlug ?? msg.roomId?.replace('globe:', '');
        incrementForSlug(slug, msg.senderId);
      };
      socket.on('globe:message', messageHandler);

      // Signal fires for every globe message to every connected user,
      // regardless of which room they've joined — keeps the tab badge
      // live when the user is on another tab. Safe to also receive
      // alongside globe:message because incrementForSlug is a no-op
      // when the active room matches, but to avoid double-counting when
      // the user IS in the room we skip increment if they're actively viewing.
      signalHandler = (sig) => {
        const slug = sig.slug ?? sig.roomId?.replace('globe:', '');
        incrementForSlug(slug, sig.senderId);
      };
      socket.on('globe:unread-signal', signalHandler);
    });

    return () => {
      const socket = getSocket();
      if (messageHandler) socket?.off('globe:message', messageHandler);
      if (signalHandler) socket?.off('globe:unread-signal', signalHandler);
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
              {bellCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {bellCount > 99 ? '99+' : bellCount}
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
          tabBarBadge: chatTabBadge > 0 ? '' : undefined,
          tabBarBadgeStyle: dotBadgeStyle,
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
          tabBarBadge: totalUnread > 0 ? '' : undefined,
          tabBarBadgeStyle: dotBadgeStyle,
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
        name="news"
        options={{
          title: 'News',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="news" color={color} focused={focused} />
          ),
          headerTitle: 'News',
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

const dotBadgeStyle = {
  backgroundColor: COLORS.accent,
  minWidth: 10,
  maxWidth: 10,
  minHeight: 10,
  maxHeight: 10,
  borderRadius: 5,
  fontSize: 0,
  lineHeight: 0,
  paddingHorizontal: 0,
  paddingVertical: 0,
} as const;

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
