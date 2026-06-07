// Phase 18-04: horizontal news card for the Tribe hub carousel.
//
// A fixed-width (~78% screen width, max 320px) card variant of NewsTile:
//   - OG image (16:9 aspect ratio) with image-failed fallback
//   - Rephrased headline (2 lines max), preferring translatedTitle (English)
//   - Outlet name + relative time
//   - Tap → open article in in-app WebBrowser (SFSafariViewController / CCT)
//   - RTL-aware writing direction for Hebrew / Arabic headlines
//   - No reactions or share — lean card optimised for carousel scanning
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';
import type { NewsArticle } from '@/types';

// ── Sizing ────────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
// ~78% of screen, capped at 320 — feels like a card in a carousel, not a tile
export const NEWS_CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.78), 320);

// ── Props ────────────────────────────────────────────────────────────────────

export interface NewsCardProps {
  article: NewsArticle;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Inline relative-time formatter (mirrors NewsTile and globe/index.tsx). */
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

export function NewsCard({ article }: NewsCardProps) {
  const { colors } = useTheme();

  // Flip to no-image layout if the OG image URL fails (broken CDN, 404, etc.)
  const [imageFailed, setImageFailed] = useState(false);

  // D-01: prefer English translated title, fall back to rephrased title
  const headline = article.translatedTitle ?? article.rephrasedTitle;

  // RTL detection for Hebrew / Arabic characters (FEED-09)
  const isRTL = !!headline && /[֐-׿؀-ۿ]/.test(headline);

  const showImage = !!article.imageUrl && !imageFailed;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** FEED-04: open article in SFSafariViewController (iOS) / Chrome Custom Tabs (Android). */
  const handleOpen = useCallback(async () => {
    try {
      Haptics.selectionAsync();
      await WebBrowser.openBrowserAsync(article.sourceUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // user dismissed or browser unavailable — silent
    }
  }, [article.sourceUrl]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Pressable
      onPress={handleOpen}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open article: ${headline}`}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
            width: NEWS_CARD_WIDTH,
          },
        ]}
      >
        {/* OG image — 16:9 fixed aspect ratio prevents layout jank while loading */}
        {showImage && (
          <Image
            source={{ uri: article.imageUrl! }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        )}

        <View style={styles.body}>
          {/* Headline — 2 lines max; RTL-aware direction */}
          <Text
            style={[
              styles.headline,
              {
                color: colors.text,
                writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const),
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
            numberOfLines={2}
          >
            {headline}
          </Text>

          {/* Summary snippet — only shown when there is no image */}
          {!showImage && !!article.summary && (
            <Text
              style={[styles.summary, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {article.summary}
            </Text>
          )}

          {/* Footer: outlet · relative time */}
          <Text
            style={[styles.outlet, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {article.outletName} · {formatRelativeTime(article.publishedAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default NewsCard;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.md,
    // Avoid elevation conflicts with borderRadius on Android
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  // Fixed aspect ratio so layout doesn't shift as the image loads
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  body: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  headline: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    lineHeight: 21,
  },
  summary: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  outlet: {
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
});
