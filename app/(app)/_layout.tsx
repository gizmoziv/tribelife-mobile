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
import {
  useNotificationStore,
  selectBellCount,
} from '@/store/notificationStore';
import { useGlobeStore } from '@/store/globeStore';
import { useChatsStore, selectChatsHasUnread } from '@/store/chatsStore';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { useChatsListRefStore } from '@/store/chatsListRefStore';
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
  const { isAuthenticated, needsOnboarding, isLoading } = useAuthStore();
  const { setNotifications, setSummary } = useNotificationStore();
  const bellCount = useNotificationStore(selectBellCount);

  // Sync the app icon badge count to the bell event count (not raw message
  // count) so a chatty thread can't inflate the OS badge past the real
  // signal value. Clears automatically as the user catches up.
  useEffect(() => {
    Notifications.setBadgeCountAsync(bellCount).catch(() => {});
  }, [bellCount]);
  const { setUnreadCounts } = useGlobeStore();
  // Phase 10 D-07: Chats tab badge is now derived from useChatsStore alone.
  // The selector returns true if ANY row has unreadCount > 0. The legacy
  // 3-way badge (DM total + local chat + town-square slot) is collapsed to
  // one selector — single source of truth for chat unread.
  const chatsHasUnread = useChatsStore(selectChatsHasUnread);
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

  // Fetch Globe unread counts and listen for real-time globe messages
  useEffect(() => {
    globeApi
      .unread()
      .then(({ unread }) => setUnreadCounts(unread))
      .catch(() => {});

    let messageHandler:
      | ((msg: {
          roomSlug?: string;
          roomId?: string;
          senderId?: number;
        }) => void)
      | null = null;
    let signalHandler:
      | ((sig: {
          slug?: string;
          roomId?: string;
          senderId?: number;
          senderHandle?: string;
          content?: string;
          createdAt?: string;
        }) => void)
      | null = null;
    connectSocket().then(() => {
      const socket = getSocket();
      if (!socket) return;

      const incrementForSlug = (
        slug: string | undefined,
        senderId: number | undefined,
      ) => {
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
        // Update the Chevra discovery tile's lastMessage preview live for
        // every connected user — including non-members who'd otherwise see
        // a stale preview frozen at the moment they first loaded /api/globe/rooms.
        if (slug && sig.senderHandle && sig.content) {
          useGlobeStore.getState().updateRoomLastMessage(slug, {
            senderHandle: sig.senderHandle,
            content: sig.content,
            createdAt: sig.createdAt ?? new Date().toISOString(),
          });
        }
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
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="chat" color={color} focused={focused} />
          ),
          tabBarBadge: chatsHasUnread ? '' : undefined,
          tabBarBadgeStyle: dotBadgeStyle,
          headerTitle: 'Chats',
        }}
        listeners={({ navigation }) => ({
          // D-07: re-tap on Chats while focused → clear search + scroll list to top
          tabPress: () => {
            if (navigation.isFocused()) {
              useChatsListRefStore.getState().clearAndScrollToTop();
            }
          },
        })}
      />
      <Tabs.Screen
        name="globe"
        options={{
          title: 'Chevra',
          tabBarIcon: ({ color, focused }) => (
            <GradientTabIcon icon="community" color={color} focused={focused} />
          ),
          // Chevra is a discovery surface — no unread notifications belong on
          // this tab. Joined regional rooms surface unread via the Chats tab
          // (selectChatsHasUnread covers all rows incl. globe_room variants).
          headerTitle: 'Chevra',
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
