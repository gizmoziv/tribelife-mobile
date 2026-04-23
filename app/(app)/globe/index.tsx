import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobeStore } from '@/store/globeStore';
import { globeApi } from '@/services/api';
import { connectSocket, onGlobeParticipants } from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { GlassCard } from '@/components/ui/GlassCard';
import type { GlobeRoom } from '@/types';
import Svg, { Path, Circle } from 'react-native-svg';

// ── Icons ───────────────────────────────────────────────────────────────────
function GlobeHeaderIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2a10 10 0 1010 10A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"
        stroke={COLORS.primary}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function OnlineDot() {
  return (
    <Svg width={8} height={8} viewBox="0 0 8 8">
      <Circle cx={4} cy={4} r={4} fill={COLORS.secondary} />
    </Svg>
  );
}

// ── Room List Item ──────────────────────────────────────────────────────────
function RoomListItem({
  room,
  unreadCount,
  onPress,
}: {
  room: GlobeRoom;
  unreadCount: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  const timeAgo = room.lastMessage
    ? formatRelativeTime(room.lastMessage.createdAt)
    : null;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <GlassCard style={styles.roomCard}>
        <View style={styles.roomRow}>
          <View style={styles.roomInfo}>
            <View style={styles.roomNameRow}>
              <Text style={[styles.roomName, { color: colors.text }]} numberOfLines={1}>
                {room.displayName}
              </Text>
              {room.isSuggested && (
                <View style={[styles.suggestedBadge, { backgroundColor: colors.primaryGlow }]}>
                  <Text style={[styles.suggestedText, { color: COLORS.primary }]}>
                    Your region
                  </Text>
                </View>
              )}
              {room.isGlobal && (
                <GlobeHeaderIcon />
              )}
            </View>
            <Text
              style={[styles.roomDescription, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {room.description}
            </Text>
            {room.lastMessage && (
              <Text
                style={[styles.lastMessage, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                @{room.lastMessage.senderHandle}: {room.lastMessage.content}
                {timeAgo ? ` \u00B7 ${timeAgo}` : ''}
              </Text>
            )}
          </View>
          <View style={styles.roomMeta}>
            <View style={styles.onlineRow}>
              <OnlineDot />
              <Text style={[styles.onlineText, { color: colors.textMuted }]}>
                {room.participantCount}
              </Text>
            </View>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function GlobeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    rooms,
    isLoadingRooms,
    unreadCounts,
    setRooms,
    setLoadingRooms,
    updateParticipantCount,
    markRoomRead,
  } = useGlobeStore();

  useEffect(() => {
    setLoadingRooms(true);
    globeApi
      .rooms()
      .then(({ rooms: data }) => {
        setRooms(data);
      })
      .catch(() => {})
      .finally(() => setLoadingRooms(false));

    const cleanups: (() => void)[] = [];

    connectSocket().then(() => {
      const offParticipants = onGlobeParticipants(({ slug, count }) => {
        updateParticipantCount(slug, count);
      });
      cleanups.push(offParticipants);
    });

    return () => { cleanups.forEach(fn => fn()); };
  }, []);

  const tabBarSpace = useTabBarSpace();
  const sortedRooms = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);

  const renderItem = useCallback(
    ({ item }: { item: GlobeRoom }) => (
      <RoomListItem
        room={item}
        unreadCount={unreadCounts[item.slug] ?? 0}
        onPress={() => {
          // Clear locally so the badge disappears before the room screen's
          // markRoomRead call lands (which also clears server-side via read-pos).
          if ((unreadCounts[item.slug] ?? 0) > 0) markRoomRead(item.slug);
          router.push(`/globe/${item.slug}`);
        }}
      />
    ),
    [router, unreadCounts, markRoomRead],
  );

  if (isLoadingRooms) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Globe', headerBackTitle: 'Back' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Globe', headerBackTitle: 'Back' }} />
      <FlatList
        data={sortedRooms}
        keyExtractor={(item) => item.slug}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: tabBarSpace }} />}
      />
    </SafeAreaView>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
  },
  roomCard: {
    marginBottom: SPACING.sm,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: 4,
  },
  roomNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomName: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  suggestedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  suggestedText: {
    fontSize: 11,
    fontFamily: FONTS.medium,
  },
  roomDescription: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  lastMessage: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  roomMeta: {
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
    gap: 6,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: FONTS.bold,
  },
});
