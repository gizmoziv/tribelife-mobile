import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { newsApi } from '@/services/api';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, SPACING } from '@/constants';
import type { NewsArticle } from '@/types';

export default function NewsScreen() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();

  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Shared fetch routine. `mode` determines whether articles replace or append.
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
    []
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
    } catch (err) {
      console.error('[news] refresh failed', err);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // PLACEHOLDER renderItem — Plan 03 replaces with <NewsTile>
  const renderItem = useCallback(
    ({ item }: { item: NewsArticle }) => (
      <View style={[styles.placeholderRow, { borderColor: colors.border }]}>
        <Text style={[styles.placeholderText, { color: colors.text }]} numberOfLines={3}>
          {item.translatedTitle ?? item.rephrasedTitle}
        </Text>
        <Text style={[styles.placeholderMeta, { color: colors.textMuted }]}>
          {item.outletName}
        </Text>
      </View>
    ),
    [colors.border, colors.text, colors.textMuted]
  );

  if (loadingInitial) {
    return (
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: SPACING.md, flexGrow: 1 },
  footerLoader: { marginVertical: SPACING.md },
  placeholderRow: { padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderRadius: 8 },
  placeholderText: { fontFamily: FONTS.medium, fontSize: 16, marginBottom: SPACING.xs },
  placeholderMeta: { fontFamily: FONTS.regular, fontSize: 12 },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: SPACING.sm },
  emptyBody: { fontFamily: FONTS.regular, fontSize: 14, textAlign: 'center', paddingHorizontal: SPACING.xl },
});
