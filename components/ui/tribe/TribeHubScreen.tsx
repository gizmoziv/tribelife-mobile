// Phase 18-01: Tribe Hub parent screen component.
//
// Owns the screen chrome previously in app/(app)/tribe/index.tsx:
//   - SafeAreaView + theme
//   - useTabBarSpace for bottom padding
//   - foreground-context set/clear effect ({ type: 'tribe' })
//   - news_breaking in-app banner state (OS banner suppressed when on tribe tab)
//
// Composes a vertical ScrollView with sections in order:
//   1. TribeTodaySection (18-03 wires real data)
//   2. TribeNewsSection  (18-04 builds horizontal carousel)
//
// The outer ScrollView is vertical; 18-04's inner FlatList is horizontal
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
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/contexts/ThemeContext';
import { onNewsAvailable } from '@/services/socket';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import { TribeTodaySection } from './TribeTodaySection';
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
  const [filter, setFilter] = useState<TribeFilterKey>('all');

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

      {/* Candle Lighting + filter pills are a fixed header, above whichever
          body renders below — mirrors the Chats tab (search + pills fixed,
          only the list scrolls). */}
      <View style={styles.topSection}>
        <TribeTodaySection />
        <TribeFilterPills value={filter} onChange={setFilter} />
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
