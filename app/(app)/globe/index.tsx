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
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobeStore } from '@/store/globeStore';
import { globeApi } from '@/services/api';
import { connectSocket, onGlobeParticipants, onChevraGroupMessage } from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS, GLOBE_ROOM_TINTS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { GlassCard } from '@/components/ui/GlassCard';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import type { ChevraRow, ChevraListResponse } from '@/types';
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

// ── Member Pill ─────────────────────────────────────────────────────────────
// Phase 12 D-07: inline "Member" badge for public group rows where isMember=true.
function MemberPill() {
  return (
    <View
      style={{
        backgroundColor: COLORS.success + '22',
        borderRadius: RADIUS.pill,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginLeft: 6,
      }}
    >
      <Text style={{ fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.success }}>
        Member
      </Text>
    </View>
  );
}

// ── Group Pill ──────────────────────────────────────────────────────────────
function GroupPill() {
  return (
    <View
      style={{
        backgroundColor: COLORS.primaryGlow,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 6,
      }}
    >
      <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.primary }}>
        GROUP
      </Text>
    </View>
  );
}


// ── Room List Item ──────────────────────────────────────────────────────────
// Phase 12 D-07: accepts ChevraRow union (kind: 'globe_room' | 'group').
// Globe-room branch: existing UI verbatim.
// Group branch: AvatarCircle + name + memberCount + lastMessage + MemberPill.
function RoomListItem({
  item,
  onPress,
}: {
  item: ChevraRow;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  // ── Group row ──────────────────────────────────────────────────────────────
  if (item.kind === 'group') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <GlassCard style={styles.roomCard}>
          <View style={styles.roomRow}>
            <AvatarCircle
              name={item.name}
              size={44}
              imageUrl={item.iconUrl ?? undefined}
              showRing={false}
            />
            <View style={[styles.roomInfo, { marginLeft: SPACING.sm }]}>
              <View style={styles.roomNameRow}>
                <Text style={[styles.roomName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <GroupPill />
                {item.isMember && <MemberPill />}
              </View>
              <Text style={[styles.lastMessage, { color: colors.textMuted }]} numberOfLines={1}>
                {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
                {item.lastMessage ? ` · ${item.lastMessage.content.slice(0, 40)}` : ''}
              </Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  }

  // ── Globe room row (existing UI verbatim) ───────────────────────────────────
  const timeAgo = item.lastMessage
    ? formatRelativeTime(item.lastMessage.createdAt)
    : null;

  const tint = GLOBE_ROOM_TINTS[item.slug] ?? COLORS.primary;

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
                {item.displayName}
              </Text>
              {/* Phase 11 D-06: "Your region" badge dropped — server now sorts user's region first. */}
              {/* Joined rooms are filtered out of Community discovery entirely
                  (see visibleRooms below) — no Member pill needed on this surface. */}
            </View>
            {item.lastMessage && (
              <Text
                style={[styles.lastMessage, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                @{item.lastMessage.senderHandle}: {item.lastMessage.content}
                {timeAgo ? ` · ${timeAgo}` : ''}
              </Text>
            )}
          </View>
          <View style={styles.roomMeta}>
            <View style={styles.onlineRow}>
              <OnlineDot />
              <Text style={[styles.onlineText, { color: colors.textMuted }]}>
                {item.participantCount}
              </Text>
            </View>
            {/* No unread badge on Chevra discovery rows — the user is by
                definition NOT a member of any row that renders here (joined
                rooms are filtered out). Unread for joined rooms surfaces in
                the Chats tab. */}
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
  // Phase 12 D-07: public group rows kept in local state; store remains GlobeRoom[].
  const [publicGroupRows, setPublicGroupRows] = useState<ChevraRow[]>([]);

  // 200ms debounce on the search input (per 11-CONTEXT.md D-09)
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const fetchChevra = useCallback(() => {
    setLoadingRooms(true);
    globeApi
      .rooms()
      .then((response) => {
        const data = (response as ChevraListResponse).rooms;

        // Phase 12 D-07: split mixed ChevraRow[] into globe rooms and public groups.
        // Store keeps GlobeRoom[] shape (other consumers depend on it).
        const globeRoomRows = data.filter(
          (r): r is Extract<ChevraRow, { kind: 'globe_room' }> => r.kind === 'globe_room',
        );
        const groupRows = data.filter(
          (r): r is Extract<ChevraRow, { kind: 'group' }> => r.kind === 'group',
        );

        // Strip `kind` field before pushing into store (GlobeRoom has no `kind`).
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const storeRooms = globeRoomRows.map(({ kind, ...rest }) => rest as Parameters<typeof setRooms>[0][0]);
        setRooms(storeRooms);

        // Phase 11 D-11: hydrate the membership map from server truth.
        useGlobeStore.getState().setMembershipMap(
          Object.fromEntries(globeRoomRows.map((r) => [r.slug, r.isMember])),
        );

        setPublicGroupRows(groupRows);
      })
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
  }, [setRooms, setLoadingRooms]);

  // Re-fetch every time the Chevra tab gains focus so newly-created public
  // groups, fresh last-message previews, and just-joined memberships all show
  // up without requiring an app restart.
  useFocusEffect(
    useCallback(() => {
      fetchChevra();
    }, [fetchChevra]),
  );

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    connectSocket().then(() => {
      const offParticipants = onGlobeParticipants(({ slug, count }) => {
        updateParticipantCount(slug, count);
      });
      cleanups.push(offParticipants);

      // Phase 12: live last-message preview on Chevra rows.
      const offChevraMsg = onChevraGroupMessage((payload) => {
        setPublicGroupRows((prev) => {
          const idx = prev.findIndex(
            (r) => r.kind === 'group' && r.conversationId === payload.conversationId,
          );
          if (idx === -1) {
            // Row not yet present — server fetch on next focus will surface it.
            return prev;
          }
          const next = prev.slice();
          const target = next[idx];
          if (target.kind !== 'group') return prev;
          next[idx] = { ...target, lastMessage: payload.lastMessage };
          return next;
        });
      });
      cleanups.push(offChevraMsg);
    });

    return () => { cleanups.forEach(fn => fn()); };
  }, []);

  const tabBarSpace = useTabBarSpace();

  // Phase 12 D-08: Server orders both buckets; mobile preserves receive order.
  // Globe-room filter: exclude Town Square (auto-joined) + already-joined rooms.
  // Group filter: mirror the globe-room rule — Chevra is a discovery surface,
  // groups the user already belongs to surface in the Chats tab instead.
  const visibleGlobeRooms = useMemo(
    () =>
      rooms.filter(
        (r) => r.slug !== 'town-square' && !(isMember[r.slug] ?? r.isMember),
      ),
    [rooms, isMember],
  );

  const visiblePublicGroups = useMemo(
    () => publicGroupRows.filter((r) => r.kind === 'group' && !r.isMember),
    [publicGroupRows],
  );

  // Combine: globe rooms first (filtered), then public groups (filtered) — D-08.
  // Re-attach kind discriminator to globe rows so RoomListItem can branch on item.kind.
  const combinedRows = useMemo((): ChevraRow[] => [
    ...visibleGlobeRooms.map((r) => ({ kind: 'globe_room' as const, ...r })),
    ...visiblePublicGroups,
  ], [visibleGlobeRooms, visiblePublicGroups]);

  const q = debouncedQuery.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      q
        ? combinedRows.filter((r) =>
            r.kind === 'globe_room'
              ? r.displayName.toLowerCase().includes(q)
              : r.name.toLowerCase().includes(q),
          )
        : combinedRows,
    [combinedRows, q],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChevraRow }) => (
      <RoomListItem
        item={item}
        onPress={() => {
          if (item.kind === 'group') {
            // Phase 12 D-07: route group tap to the unified chat screen, but
            // through the Chevra-stack alias (app/(app)/globe/group/
            // [conversationId].tsx) so the bottom-nav tab indicator stays on
            // Chevra during preview and tapping Chats actually switches back.
            // Same component, same params — Plan 12-08 preview branch runs
            // unchanged on the receiving screen.
            router.push({
              pathname: '/(app)/globe/group/[conversationId]',
              params: {
                conversationId: item.conversationId.toString(),
                isGroup: 'true',
                groupName: item.name,
                isMember: item.isMember ? 'true' : 'false',
                inviteSlug: item.inviteSlug,
              },
            });
            return;
          }
          // Globe room tap: clear local unread badge then navigate.
          if ((unreadCounts[item.slug] ?? 0) > 0) markRoomRead(item.slug);
          router.push(`/globe/${item.slug}`);
        }}
      />
    ),
    [router, unreadCounts, markRoomRead],
  );

  // Stable key per row type — globe rooms keyed by slug, groups by conversationId.
  const keyExtractor = useCallback(
    (item: ChevraRow) =>
      item.kind === 'globe_room' ? `globe_${item.slug}` : `group_${item.conversationId}`,
    [],
  );

  if (isLoadingRooms) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Chevra', headerBackTitle: 'Back' }} />
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
      {filteredRows.length === 0 && q.length > 0 ? (
        <View style={styles.emptyMatches}>
          <Text style={[styles.emptyMatchesText, { color: colors.textMuted }]}>
            {'No matches for "' + debouncedQuery + '"'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={keyExtractor}
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
