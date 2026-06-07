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
// The outer ScrollView is vertical; 18-04's inner FlatList will be horizontal
// (no nested same-axis VirtualizedList warning).
import React, { useCallback, useEffect, useState } from 'react';
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
import { TribeNewsSection } from './TribeNewsSection';

export function TribeHubScreen() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();

  // In-app banner shown when a news_breaking push arrives while this screen
  // is mounted. The OS push for the same event is suppressed by the handler
  // in services/pushNotifications.ts (foreground + ctx.type==='tribe').
  const [hasNewArticles, setHasNewArticles] = useState(false);

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
    // Dismiss the banner; 18-04 will wire a real refresh here.
    setHasNewArticles(false);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {hasNewArticles && (
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarSpace }]}
      >
        <TribeTodaySection />
        <TribeNewsSection />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingTop: SPACING.md,
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
