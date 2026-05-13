import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobeStore } from '@/store/globeStore';
import { globeApi } from '@/services/api';
import { connectSocket, onGlobeParticipants } from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS, GLOBE_ROOM_TINTS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { GlassCard } from '@/components/ui/GlassCard';
import type { GlobeRoom } from '@/types';
import Svg, { Path, Circle } from 'react-native-svg';

// ── Icons ───────────────────────────────────────────────────────────────────
function GlobeHeaderIcon({ color = COLORS.primary }: { color?: string } = {}) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 18a8 8 0 118-8 8 8 0 01-8 8z" stroke={color} strokeWidth={1.5} />
      <Path
        d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"
        stroke={color}
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

  const tint = GLOBE_ROOM_TINTS[room.slug] ?? COLORS.primary;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <GlassCard style={styles.roomCard}>
        <View style={styles.roomRow}>
          <View style={[styles.roomIconContainer, { backgroundColor: tint }]}>
            <GlobeHeaderIcon color="#FFF" />
          </View>
          <View style={styles.roomInfo}>
            <View style={styles.roomNameRow}>
              <Text style={[styles.roomName, { color: colors.text }]} numberOfLines={1}>
                {room.displayName}
              </Text>
              {/* Phase 11 D-06: "Your region" badge dropped — server now sorts user's region first. */}
              {/* Joined rooms are filtered out of Community discovery entirely
                  (see visibleRooms below) — no Member pill needed on this surface. */}
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
                {timeAgo ? ` · ${timeAgo}` : ''}
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
    isMember,
    setRooms,
    setLoadingRooms,
    updateParticipantCount,
    markRoomRead,
  } = useGlobeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // 200ms debounce on the search input (per 11-CONTEXT.md D-09)
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    setLoadingRooms(true);
    globeApi
      .rooms()
      .then(({ rooms: data }) => {
        setRooms(data);
        // Phase 11 D-11: hydrate the membership map from server truth.
        useGlobeStore.getState().setMembershipMap(
          Object.fromEntries(data.map((r) => [r.slug, r.isMember])),
        );
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

  // Server now orders rooms (user-region first, then sortOrder ASC) — do NOT re-sort here.
  // Discovery list excludes Town Square (every user has it via Phase 7) AND any room
  // the user has already joined. Effective membership = store-first (for instant
  // post-join updates without a re-fetch), with server-truth fallback for cold mount.
  const visibleRooms = useMemo(
    () =>
      rooms.filter(
        (r) => r.slug !== 'town-square' && !(isMember[r.slug] ?? r.isMember),
      ),
    [rooms, isMember],
  );
  const q = debouncedQuery.trim().toLowerCase();
  const filteredRooms = useMemo(
    () => (q ? visibleRooms.filter((r) => r.displayName.toLowerCase().includes(q)) : visibleRooms),
    [visibleRooms, q],
  );

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
        <Stack.Screen options={{ title: 'Community', headerBackTitle: 'Back' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Community', headerBackTitle: 'Back' }} />
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, {
            backgroundColor: colors.surfaceGlass,
            color: colors.text,
            borderColor: colors.border,
          }]}
          placeholder="Search communities"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      {filteredRooms.length === 0 && q.length > 0 ? (
        <View style={styles.emptyMatches}>
          <Text style={[styles.emptyMatchesText, { color: colors.textMuted }]}>
            {'No matches for “' + debouncedQuery + '”'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item) => item.slug}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: tabBarSpace }} />}
        />
      )}
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
  roomIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
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
  searchRow: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchInput: {
    height: 40,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  emptyMatches: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  emptyMatchesText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
});
