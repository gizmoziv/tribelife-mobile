import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/contexts/ThemeContext';
import { newsApi, applyReactionToggle } from '@/services/api';
import { onNewsAvailable } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
import { NewsTile } from '@/components/ui/news/NewsTile';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import type { NewsArticle } from '@/types';

export default function NewsScreen() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ContextMenu state — one article selected at a time (T-03-03-06: boolean guard)
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // In-app banner shown when a news_breaking push arrives while this screen
  // is mounted. The OS push for the same event is suppressed by the handler
  // in services/pushNotifications.ts (foreground + ctx.type==='news').
  const [hasNewArticles, setHasNewArticles] = useState(false);

  // Tell the push-notification handler we're on the news tab so it suppresses
  // OS banners for news_breaking pushes — we surface them in-app instead.
  useEffect(() => {
    const setContext = useForegroundContextStore.getState().setContext;
    setContext({ type: 'news' });
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

  // ── Feed loading ──────────────────────────────────────────────────────────

  /** Shared fetch routine. `mode` determines whether articles replace or append. */
  const load = useCallback(
    async (beforeCursor: string | null, mode: 'initial' | 'more' | 'refresh') => {
      const res = await newsApi.feed(beforeCursor ?? undefined);
      if (mode === 'initial' || mode === 'refresh') {
        setArticles(res.articles);
      } else {
        setArticles(prev => [...prev, ...res.articles]);
      }
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    },
    [],
  );

  // Initial load
  useEffect(() => {
    load(null, 'initial')
      .catch(err => console.error('[news] initial load failed', err))
      .finally(() => setLoadingInitial(false));
  }, [load]);

  // Pitfall 2: gate onEndReached with loadingMore + hasMore + cursor present
  const handleEndReached = useCallback(() => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    load(cursor, 'more')
      .catch(err => console.error('[news] load more failed', err))
      .finally(() => setLoadingMore(false));
  }, [cursor, hasMore, loadingMore, load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(null, 'refresh');
      setHasNewArticles(false);
    } catch (err) {
      console.error('[news] refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleBannerTap = useCallback(async () => {
    try {
      await load(null, 'refresh');
    } catch (err) {
      console.error('[news] banner refresh failed', err);
    }
    setHasNewArticles(false);
  }, [load]);

  // ── Reaction handler (unified — used by both menu pick AND pill tap) ───────

  /**
   * Optimistic reaction toggle with rollback on network error.
   * D-07: applyReactionToggle flips add/remove based on current userIds membership.
   * Passes currentUserId so optimistic userIds[] matches server shape — prevents
   * count flicker on pull-to-refresh (first-tap produces userIds:[currentUserId]).
   */
  const handleReactionToggle = useCallback(
    async (articleId: number, emoji: string) => {
      if (!currentUserId) return; // unreachable for authenticated users, but typesafe guard
      // Optimistic update
      setArticles(prev =>
        prev.map(a => (a.id === articleId ? applyReactionToggle(a, emoji, currentUserId) : a)),
      );
      try {
        await newsApi.toggleReaction(articleId, emoji);
      } catch {
        // Rollback: applying toggle twice with same args reverts to original state
        setArticles(prev =>
          prev.map(a => (a.id === articleId ? applyReactionToggle(a, emoji, currentUserId) : a)),
        );
      }
    },
    [currentUserId],
  );

  // ── ContextMenu handlers ──────────────────────────────────────────────────

  const handleLongPress = useCallback((a: NewsArticle) => {
    setSelectedArticle(a);
    setMenuVisible(true);
  }, []);

  /** Called when user picks an emoji from the context menu. */
  const handleMenuReact = useCallback(
    (emoji: string) => {
      if (!selectedArticle) return;
      setMenuVisible(false);
      handleReactionToggle(selectedArticle.id, emoji);
    },
    [selectedArticle, handleReactionToggle],
  );

  // ── Render item ───────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: NewsArticle }) => (
      <NewsTile
        article={item}
        onLongPress={handleLongPress}
        onReactionToggle={handleReactionToggle}
      />
    ),
    [handleLongPress, handleReactionToggle],
  );

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loadingInitial) {
    return (
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

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
      <FlatList
        data={articles}
        keyExtractor={a => String(a.id)}
        renderItem={renderItem}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        ListFooterComponent={
          <>
            {loadingMore && <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} />}
            <View style={{ height: tabBarSpace }} />
          </>
        }
        ListEmptyComponent={
          <View style={[styles.centered, { paddingTop: SPACING.xl * 2 }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No news yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Articles appear here as they're ingested from our outlets. Check back soon.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        windowSize={10}
        removeClippedSubviews
      />

      {/* ContextMenu — reaction-only: onReply, onTranslate, onReport intentionally OMITTED.
          Task 1 made all three optional; omitting hides the rows (no dead buttons).
          News (Phase 3) has no reply flow, D-05 translation is tile-level, and article
          moderation is deferred to a future phase (extend content_type enum to 'news'). */}
      <ContextMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReact={handleMenuReact}
        messageContent={selectedArticle?.rephrasedTitle ?? ''}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: SPACING.md, flexGrow: 1 },
  footerLoader: { marginVertical: SPACING.md },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: SPACING.sm },
  emptyBody: { fontFamily: FONTS.regular, fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.xl },
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
