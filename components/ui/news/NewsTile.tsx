import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { ReactionPills } from '@/components/ui/chat/ReactionPills';
import type { NewsArticle } from '@/types';

// ── Props ────────────────────────────────────────────────────────────────────

interface NewsTileProps {
  article: NewsArticle;
  onLongPress: (article: NewsArticle) => void;
  onReactionToggle: (articleId: number, emoji: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Inline relative-time formatter (same logic as globe/index.tsx — not extracted per Phase 3 scope). */
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

// ── Component ────────────────────────────────────────────────────────────────

export function NewsTile({ article, onLongPress, onReactionToggle }: NewsTileProps) {
  const { colors } = useTheme();

  // Translation toggle state (D-05 — tile-level, not context menu)
  const [showOriginal, setShowOriginal] = useState(false);

  // D-01: show English translated title when available; fall back to rephrased
  const englishHeadline = article.translatedTitle ?? article.rephrasedTitle;
  // When user taps "Show original", flip to the original-language rephrasedTitle
  const headline = showOriginal ? article.rephrasedTitle : englishHeadline;

  // RTL detection for Hebrew / Arabic characters (FEED-09)
  const isRTL = !!headline && /[\u0590-\u05FF\u0600-\u06FF]/.test(headline);
  const textDirection = isRTL ? ('rtl' as const) : ('ltr' as const);

  // Show translation toggle only when we have a non-English original (both strings present)
  const canToggleLanguage = !!article.translatedTitle;

  // D-01: image-top layout vs. summary-fallback layout
  const showImage = !!article.imageUrl;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** FEED-04: open article in SFSafariViewController (iOS) / Chrome Custom Tabs (Android). */
  const handleOpen = useCallback(async () => {
    try {
      await WebBrowser.openBrowserAsync(article.sourceUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // user dismissed or browser unavailable — silent
    }
  }, [article.sourceUrl]);

  /** FEED-05: native share with locked copy from REQUIREMENTS. */
  const handleShare = useCallback(() => {
    Share.share({
      message: `I found this article on TribeLife and thought you'd be interested: ${article.sourceUrl}`,
    }).catch(() => {});
  }, [article.sourceUrl]);

  /** REACT-01: haptic + forward long-press to parent (parent wires ContextMenu). */
  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(article);
  }, [article, onLongPress]);

  /** REACT-03 / D-07: forward reaction toggle with articleId to parent. */
  const handleReactionToggle = useCallback(
    (emoji: string) => {
      onReactionToggle(article.id, emoji);
    },
    [article.id, onReactionToggle],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Pressable onPress={handleOpen} onLongPress={handleLongPress} delayLongPress={500}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Image-top layout (D-01) — Pitfall 1: fixed aspectRatio prevents layout jank */}
        {showImage && (
          <Image
            source={{ uri: article.imageUrl! }}
            style={styles.image}
            resizeMode="cover"
          />
        )}

        <View style={styles.body}>
          {/* Headline — 3 lines max; RTL-aware writing direction */}
          <Text
            style={[
              styles.headline,
              {
                color: colors.text,
                writingDirection: textDirection,
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
            numberOfLines={3}
          >
            {headline}
          </Text>

          {/* Summary snippet — only rendered in no-image layout (D-01) */}
          {!showImage && !!article.summary && (
            <Text
              style={[styles.summary, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {article.summary}
            </Text>
          )}

          {/* Footer row: outlet · time | Show original | Share */}
          <View style={styles.footer}>
            <Text
              style={[styles.outlet, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {article.outletName} · {formatRelativeTime(article.publishedAt)}
            </Text>

            {/* FEED-09 / D-05: translation toggle — only when translatedTitle is present */}
            {canToggleLanguage && (
              <TouchableOpacity
                onPress={() => setShowOriginal(v => !v)}
                hitSlop={8}
              >
                <Text style={[styles.link, { color: colors.primary }]}>
                  {showOriginal ? 'Show English' : 'Show original'}
                </Text>
              </TouchableOpacity>
            )}

            {/* FEED-05: share with locked copy */}
            <TouchableOpacity onPress={handleShare} hitSlop={8}>
              <Text style={[styles.link, { color: colors.primary }]}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* REACT-03: aggregated reaction pills (reused from chat) */}
          <ReactionPills
            reactions={article.reactions ?? []}
            onToggle={handleReactionToggle}
          />
        </View>
      </View>
    </Pressable>
  );
}

export default NewsTile;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.lg,
    // Avoid elevation conflicts with borderRadius on Android
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  // Pitfall 1: fixed aspectRatio so layout doesn't shift as image loads
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  body: {
    padding: SPACING.md,
  },
  headline: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    lineHeight: 22,
    marginBottom: SPACING.sm,
  },
  summary: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    flexWrap: 'wrap',
  },
  outlet: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    flex: 1,
  },
  link: {
    fontFamily: FONTS.medium,
    fontSize: 12,
  },
});
