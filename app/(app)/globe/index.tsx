import React, { useEffect, useCallback, useState, useMemo } from 'react';
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
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useGlobeStore } from '@/store/globeStore';
import { globeApi } from '@/services/api';
import {
  connectSocket,
  onGlobeParticipants,
  onChevraGroupMessage,
} from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { ChevraCommunityTile } from '@/components/ui/chevra/ChevraCommunityTile';
import type { ChevraRow, ChevraListResponse } from '@/types';

const TILE_GAP = 12;

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

  const screenW = Dimensions.get('window').width;
  const tileWidth = (screenW - SPACING.page * 2 - TILE_GAP) / 2;

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const fetchChevra = useCallback(() => {
    setLoadingRooms(true);
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
      })
      .catch(() => {})
      .finally(() => setLoadingRooms(false));
  }, [setRooms, setLoadingRooms, debouncedQuery]);

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

  // Plan 15-04: combinedRows currently surfaces globe_room + group only. The
  // new `timezone_room` ChevraRow variant (TZRM-02) is filtered out here and
  // will be rendered by Plan 15-05's dedicated timezone-room tile + section.
  type ChevraGlobeOrGroup = Extract<ChevraRow, { kind: 'globe_room' } | { kind: 'group' }>;
  const combinedRows = useMemo(
    (): ChevraGlobeOrGroup[] => [
      ...visibleGlobeRooms.map((r) => ({ kind: 'globe_room' as const, ...r })),
      ...visiblePublicGroups.filter(
        (r): r is Extract<ChevraRow, { kind: 'group' }> => r.kind === 'group',
      ),
    ],
    [visibleGlobeRooms, visiblePublicGroups],
  );

  // Phase 14 SRCH-03: server now handles filtering via ?q=. combinedRows from
  // the server response already reflect the query — no client-side .filter needed.
  const isSearching = debouncedQuery.trim().length > 0;
  const filteredRows = combinedRows;

  const renderItem = useCallback(
    ({ item }: { item: ChevraGlobeOrGroup }) => (
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
          if ((unreadCounts[item.slug] ?? 0) > 0) markRoomRead(item.slug);
          router.push(`/globe/${item.slug}`);
        }}
      />
    ),
    [router, unreadCounts, markRoomRead, tileWidth],
  );

  const keyExtractor = useCallback(
    (item: ChevraGlobeOrGroup) =>
      item.kind === 'globe_room'
        ? `globe_${item.slug}`
        : `group_${item.conversationId}`,
    [],
  );

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
