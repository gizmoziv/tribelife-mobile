import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import Purchases from 'react-native-purchases';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobeStore } from '@/store/globeStore';
import { useAuthStore } from '@/store/authStore';
import { globeApi } from '@/services/api';
import {
  connectSocket,
  onGlobeParticipants,
  onChevraGroupMessage,
  onChatNotification,
} from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { ChevraCommunityTile } from '@/components/ui/chevra/ChevraCommunityTile';
import { UpgradeModal } from '@/components/ui/UpgradeModal';
import type { ChevraRow, ChevraListResponse } from '@/types';

const TILE_GAP = 12;

const TIMEZONE_UPGRADE_BODY =
  'Premium members can join timezone rooms beyond their own — connect with Jews in different parts of the world.';

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
  const [publicGroupRows, setPublicGroupRows] = useState<ChevraRow[]>([]);
  // Plan 15-05 (TZRM-02): keep timezone_room rows in local state so the
  // dedicated section/tile can render them with the paywall + join handlers.
  const [timezoneRoomRows, setTimezoneRoomRows] = useState<
    Extract<ChevraRow, { kind: 'timezone_room' }>[]
  >([]);
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

  const screenW = Dimensions.get('window').width;
  const tileWidth = (screenW - SPACING.page * 2 - TILE_GAP) / 2;

  // Tracks whether the first Chevra fetch has succeeded. Drives the
  // cold-start full-screen spinner; subsequent fetches refresh silently.
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const fetchChevra = useCallback(() => {
    // Only show the full-screen spinner on cold start (before the first
    // successful fetch). Subsequent refetches (focus, search-debounce,
    // member-change) refresh the list silently so the search input keeps
    // focus and content doesn't flash. `hasLoadedOnceRef` survives empty
    // result sets (e.g., a search that matches no globe rooms drops
    // globeStore.rooms to []) so we don't relapse into the cold-start path.
    if (!hasLoadedOnceRef.current) setLoadingRooms(true);
    // Phase 14 SRCH-03: pass debouncedQuery to server for title filtering.
    // Empty/whitespace-only q omits the param (globeApi.rooms trims internally).
    globeApi
      .rooms({ q: debouncedQuery })
      .then((response) => {
        const data = (response as ChevraListResponse).rooms;

        const globeRoomRows = data.filter(
          (r): r is Extract<ChevraRow, { kind: 'globe_room' }> =>
            r.kind === 'globe_room',
        );
        const groupRows = data.filter(
          (r): r is Extract<ChevraRow, { kind: 'group' }> => r.kind === 'group',
        );
        // Plan 15-05 (TZRM-02): pluck timezone_room rows into their own bucket
        // — backend Plan 15-04 already filters caller-native + premium-joined,
        // so we render whatever the server returns (D-08 trust-server).
        const tzRoomRows = data.filter(
          (r): r is Extract<ChevraRow, { kind: 'timezone_room' }> =>
            r.kind === 'timezone_room',
        );

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const storeRooms = globeRoomRows.map(
          ({ kind, ...rest }) => rest as Parameters<typeof setRooms>[0][0],
        );
        setRooms(storeRooms);

        useGlobeStore
          .getState()
          .setMembershipMap(
            Object.fromEntries(globeRoomRows.map((r) => [r.slug, r.isMember])),
          );

        setPublicGroupRows(groupRows);
        setTimezoneRoomRows(tzRoomRows);
        hasLoadedOnceRef.current = true;
      })
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
  }, [setRooms, setLoadingRooms, debouncedQuery]);

  // Refetch Chevra when a group member-change notification arrives so the
  // memberCount on group tiles tracks live joins/leaves instead of waiting
  // for the next tab focus. Body-suffix match avoids coupling to a structured
  // event type the backend doesn't currently emit.
  useEffect(() => {
    const cleanup = onChatNotification((raw) => {
      const body = (raw as { body?: string } | null)?.body;
      if (typeof body === 'string' && /(joined|left) the community$/.test(body)) {
        fetchChevra();
      }
    });
    return cleanup;
  }, [fetchChevra]);

  useFocusEffect(
    useCallback(() => {
      fetchChevra();
    }, [fetchChevra]),
  );

  // Phase 14 SRCH-03: refetch when debouncedQuery changes (server-side filter).
  // useFocusEffect handles initial load; this handles query changes while focused.
  useEffect(() => {
    fetchChevra();
  }, [debouncedQuery]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    connectSocket().then(() => {
      const offParticipants = onGlobeParticipants(({ slug, count }) => {
        updateParticipantCount(slug, count);
      });
      cleanups.push(offParticipants);

      const offChevraMsg = onChevraGroupMessage((payload) => {
        setPublicGroupRows((prev) => {
          const idx = prev.findIndex(
            (r) =>
              r.kind === 'group' && r.conversationId === payload.conversationId,
          );
          if (idx === -1) return prev;
          const next = prev.slice();
          const target = next[idx];
          if (target.kind !== 'group') return prev;
          next[idx] = { ...target, lastMessage: payload.lastMessage };
          return next;
        });
      });
      cleanups.push(offChevraMsg);
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const tabBarSpace = useTabBarSpace();

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

  // Plan 15-05 (TZRM-02): combinedRows now includes timezone_room rows. The
  // backend already filters caller-native + premium-joined out (Plan 15-04
  // D-10), so we render whatever arrived. Free callers receive paywalled rows
  // with lastMessage=null (D-03 server-enforced).
  const combinedRows = useMemo(
    (): ChevraRow[] => [
      ...visibleGlobeRooms.map((r) => ({ kind: 'globe_room' as const, ...r })),
      ...visiblePublicGroups.filter(
        (r): r is Extract<ChevraRow, { kind: 'group' }> => r.kind === 'group',
      ),
      ...timezoneRoomRows,
    ],
    [visibleGlobeRooms, visiblePublicGroups, timezoneRoomRows],
  );

  // Phase 14 SRCH-03: server now handles filtering via ?q=. combinedRows from
  // the server response already reflect the query — no client-side .filter needed.
  const isSearching = debouncedQuery.trim().length > 0;
  // Defensive dedup by key — a transient state mid-update (multiple fetchChevra
  // triggers racing) can produce duplicate entries that React flags as
  // "two children with the same key" under numColumns row grouping.
  const filteredRows = useMemo(() => {
    const seen = new Set<string>();
    const out: ChevraRow[] = [];
    for (const r of combinedRows) {
      const key =
        r.kind === 'group'
          ? `group_${r.conversationId}`
          : r.kind === 'timezone_room'
            ? `timezone_room_${r.slug}`
            : `globe_${r.slug}`;
      if (seen.has(key)) {
        if (__DEV__) console.warn('[chevra] dropped duplicate row', key);
        continue;
      }
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [combinedRows]);

  // Plan 15-05 (TZRM-01): RevenueCat purchase flow — mirror of profile/index.tsx
  // handleUpgrade (the canonical reference impl). On success we refresh caps so
  // the user's next Chevra tap fires through the joinable branch.
  const handleUpgrade = useCallback(async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const monthly = offerings.current?.monthly;
      if (!monthly) {
        Alert.alert(
          'Unavailable',
          'Premium is not available right now. Please try again later.',
        );
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(monthly);
      const isPremiumEntitlement =
        customerInfo.entitlements.active['premium'] !== undefined;
      if (isPremiumEntitlement) {
        await useAuthStore.getState().refreshCapabilities();
        // Refetch Chevra so the row the user just paywall-tapped on now
        // appears as joinable (paywalled=false) on next render.
        fetchChevra();
      }
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert(
          'Purchase Failed',
          'Unable to complete the purchase. Please try again later.',
        );
      }
    }
  }, [fetchChevra]);

  const renderItem = useCallback(
    ({ item }: { item: ChevraRow }) => (
      <ChevraCommunityTile
        item={item}
        width={tileWidth}
        onPress={() => {
          if (item.kind === 'group') {
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
          if (item.kind === 'timezone_room') {
            // Paywalled → UpgradeModal. Eligible → navigate to preview; the
            // "Join Chat" button on the room screen performs the actual join
            // (matches the globe_room read-only-preview pattern from Phase 11
            // D-12). Backend D-08 remains the authoritative gate.
            if (item.paywalled) {
              setUpgradeModalVisible(true);
              return;
            }
            router.push(`/(app)/globe/${item.slug}`);
            return;
          }
          // globe_room
          if ((unreadCounts[item.slug] ?? 0) > 0) markRoomRead(item.slug);
          router.push(`/globe/${item.slug}`);
        }}
      />
    ),
    [router, unreadCounts, markRoomRead, tileWidth],
  );

  const keyExtractor = useCallback((item: ChevraRow) => {
    if (item.kind === 'group') return `group_${item.conversationId}`;
    if (item.kind === 'timezone_room') return `timezone_room_${item.slug}`;
    return `globe_${item.slug}`;
  }, []);

  if (isLoadingRooms) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Stack.Screen options={{ title: 'Chevra', headerBackTitle: 'Back' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Community', headerBackTitle: 'Back' }} />
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={[
              styles.searchInput,
              styles.searchInputWithClear,
              {
                backgroundColor: colors.surfaceGlass,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="Search communities"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
              hitSlop={10}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Text style={[styles.searchClearText, { color: colors.textMuted }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {filteredRows.length === 0 && isSearching ? (
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
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // ListHeaderComponent={isSearching ? null : <ChevraTodaySection />}
          ListFooterComponent={<View style={{ height: tabBarSpace }} />}
        />
      )}
      <UpgradeModal
        visible={upgradeModalVisible}
        onClose={() => setUpgradeModalVisible(false)}
        onUpgrade={handleUpgrade}
        body={TIMEZONE_UPGRADE_BODY}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
  },
  columnWrapper: {
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
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
  // Phase 14 polish: clear-X button overlay on Chevra search input
  searchInputWrapper: {
    position: 'relative',
  },
  searchInputWithClear: {
    paddingRight: 36,
  },
  searchClearButton: {
    position: 'absolute',
    right: 6,
    top: 0,
    height: 40,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 22,
    fontFamily: FONTS.regular,
    lineHeight: 24,
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
