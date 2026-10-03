// Phase 18-01: Tribe Hub parent screen component.
//
// Owns the screen chrome previously in app/(app)/tribe/index.tsx:
//   - SafeAreaView + theme
//   - useTabBarSpace for bottom padding
//   - foreground-context set/clear effect ({ type: 'tribe' })
//   - news_breaking in-app banner state (OS banner suppressed when on tribe tab)
//
// Layout: a fixed header (candle strip on the All pill only, then the filter
// pills) and a body below it. On All the body is a vertical ScrollView of
// carousels (news, jobs, marketplace, survey); on a specific pill it is a
// single lazy-loaded list of that type. On the other pills the candle times
// live in the Tribe header chip (CandleHeaderChip) instead of the strip.
//
// Candle data, the filter and the details sheet state live in
// store/tribeHubStore.ts so the strip, the header chip and the sheet (mounted
// once, here) all read the same source. All candle strings come from
// utils/candleViewModel.ts.
//
// The outer ScrollView is vertical; the inner carousel FlatLists are horizontal
// (no nested same-axis VirtualizedList warning).
//
// Phase 18-04: banner tap now triggers a real carousel refresh via
// newsSectionRefreshRef — the ref is passed as onBannerRefresh prop to
// TribeNewsSection which calls it after a successful re-fetch.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  StyleSheet,
  AppState,
  LayoutAnimation,
  AccessibilityInfo,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/contexts/ThemeContext';
import { onNewsAvailable } from '@/services/socket';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import { useTribeHubStore } from '@/store/tribeHubStore';
import { buildCandleViewModel, CANDLE_SWAP_MS } from '@/utils/candleViewModel';
import { CandleStrip } from './CandleStrip';
import { CandleSheet } from './CandleSheet';
import { TribeFilterPills, type TribeFilterKey } from './TribeFilterPills';
import { TribeNewsSection } from './TribeNewsSection';
import { TribeJobsSection } from './TribeJobsSection';
import { TribeEsekSection } from './TribeEsekSection';
import { TribeSurveySection } from './TribeSurveySection';
import { TribeNewsList } from './TribeNewsList';
import { TribeJobsList } from './TribeJobsList';
import { TribeEsekList } from './TribeEsekList';

export function TribeHubScreen() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();

  // Single-select filter pill, default 'all'. 'all' renders today's page
  // unchanged (3 horizontal carousels + survey); a specific type switches to
  // a single, vertically-scrolling, lazy-loaded feed of just that type.
  // Candle data + sheet state live in the store (shared with the header chip).
  const filter = useTribeHubStore((s) => s.filter);
    const today = useTribeHubStore((s) => s.today);
  const todayLoading = useTribeHubStore((s) => s.todayLoading);
  const todayError = useTribeHubStore((s) => s.todayError);
  const todayFetchedAt = useTribeHubStore((s) => s.todayFetchedAt);
  const openSheet = useTribeHubStore((s) => s.openSheet);

  const vm = buildCandleViewModel({
    today,
    loading: todayLoading,
    error: todayError,
    fetchedAt: todayFetchedAt,
    now: Date.now(),
  });

  // Owned here (not in TribeJobsList) because that child unmounts whenever
  // the filter pill moves off Jobs. `false` (all jobs) is the intended
  // default for a fresh app session — this survives navigation within a
  // session, it is not persisted storage.
  const [myLocation, setMyLocation] = useState(false);

  // In-app banner shown when a news_breaking push arrives while this screen
  // is mounted. The OS push for the same event is suppressed by the handler
  // in services/pushNotifications.ts (foreground + ctx.type==='tribe').
  const [hasNewArticles, setHasNewArticles] = useState(false);

  // Ref to trigger a carousel refresh without lifting all pagination state.
  // TribeNewsSection sets this via its onSetRefresh prop.
  const newsSectionRefreshRef = useRef<(() => Promise<void>) | null>(null);

  // Tell the push-notification handler we're on the tribe tab so it suppresses
  // OS banners for news_breaking pushes — we surface them in-app instead.
  useEffect(() => {
    const setContext = useForegroundContextStore.getState().setContext;
    setContext({ type: 'tribe' });
    return () => setContext({ type: 'none' });
  }, []);

  // Listen for foreground notifications and flip the in-app banner flag for
  // news_breaking. Fires regardless of suppression decision in the handler.
  // (Note: iOS Simulator doesn't receive remote pushes, so this branch only
  // works on physical devices — the socket listener below covers the simulator.)
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      const data = notif.request.content.data as Record<string, unknown> | undefined;
      if (data?.type === 'news_breaking') {
        setHasNewArticles(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Realtime socket fallback — fires on every device (including simulator)
  // whenever the news ingester finishes a run that produced visible articles.
  useEffect(() => {
    const off = onNewsAvailable(() => setHasNewArticles(true));
    return off;
  }, []);

  // Candle data: first focus does the initial fetch (fetchedAt starts null);
  // later focus / foreground refetches only when the data is over 10 min old.
  useFocusEffect(
    useCallback(() => {
      useTribeHubStore.getState().refreshTodayIfStale();
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') useTribeHubStore.getState().refreshTodayIfStale();
    });
    return () => sub.remove();
  }, []);

  // Logout / unmount: drop candle data (a location label) and any in-flight fetch.
  useEffect(() => {
    return () => useTribeHubStore.getState().reset();
  }, []);

  // Reduce Motion: seeded once, kept current by the change event.
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { reduceMotionRef.current = on; })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotionRef.current = on;
    });
    return () => sub.remove();
  }, []);

  // Crossing the All boundary swaps the strip for the header chip (or back):
  // a short fade/collapse, skipped with Reduce Motion. Both changes land in
  // the same commit, so they share the one animation tick.
  const handleFilterChange = useCallback((next: TribeFilterKey) => {
    const current = useTribeHubStore.getState().filter;
    const crossesAll = (current === 'all') !== (next === 'all');
    if (crossesAll && !reduceMotionRef.current) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(CANDLE_SWAP_MS,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity),
      );
    }
    useTribeHubStore.getState().setFilter(next);
  }, []);

  const handleStripPress = useCallback(() => {
    if (vm.state === 'error') {
      void useTribeHubStore.getState().fetchToday();
      return;
    }
    if (vm.state === 'loading') return;
    openSheet(vm.state === 'no-location' ? 'location' : 'details');
  }, [vm.state, openSheet]);

  const handleBannerTap = useCallback(() => {
    setHasNewArticles(false);
    // Trigger a real carousel refresh (18-04 wired via newsSectionRefreshRef).
    newsSectionRefreshRef.current?.();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Banner only fires a refresh on the News carousel (via the ref below),
          which is only mounted in the 'all' view — suppress it otherwise. */}
      {hasNewArticles && filter === 'all' && (
        <TouchableOpacity
          onPress={handleBannerTap}
          activeOpacity={0.85}
          style={[styles.newArticlesBanner, { backgroundColor: COLORS.primary }]}
        >
          <Text style={styles.newArticlesBannerText}>
            New articles available — tap to refresh
          </Text>
        </TouchableOpacity>
      )}

      {/* Candle strip (All only) + filter pills are a fixed header, above
          whichever body renders below — mirrors the Chats tab (search + pills
          fixed, only the list scrolls). */}
      <View style={styles.topSection}>
        {filter === 'all' && <CandleStrip vm={vm} onPress={handleStripPress} />}
        <TribeFilterPills value={filter} onChange={handleFilterChange} />
      </View>

      {filter === 'all' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarSpace }}
        >
          <TribeNewsSection
            onSetRefresh={(fn) => { newsSectionRefreshRef.current = fn; }}
          />
          <TribeJobsSection />
          <TribeEsekSection />
          <TribeSurveySection />
        </ScrollView>
      ) : (
        <View style={styles.filteredBody}>
          {filter === 'news' && <TribeNewsList />}
          {filter === 'jobs' && (
            <TribeJobsList
              myLocation={myLocation}
              onMyLocationChange={setMyLocation}
            />
          )}
          {filter === 'marketplace' && <TribeEsekList />}
        </View>
      )}

      <CandleSheet vm={vm} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topSection: {
    paddingTop: SPACING.md,
  },
  filteredBody: {
    flex: 1,
  },
  newArticlesBanner: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  newArticlesBannerText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
});
