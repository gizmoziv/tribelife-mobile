// Phase 33/43: marketplace card for the Tribe hub carousel and Marketplace list.
// Serves both TribeLife (Etsy) and Esek items from the combined feed; click
// attribution branches on item.source.
//
// A fixed-width (~78% screen width, max 320px) product tile, structural clone of
// JobCard/NewsCard. Layout — image / title / price ONLY (no vendor/category/meta):
//   - Product image at the top (16:9, cover) — matches NewsCard for uniform carousel height
//   - Title below (2 lines max, matches NewsCard headline)
//   - Price row at the bottom: $price, plus struck-through compareAtPrice on sale
//   - Tap → open product page in in-app WebBrowser (PAGE_SHEET)
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
import { esekApi, marketplaceApi } from '@/services/api';
import { FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';
import type { MarketplaceItem } from '@/types';

// ── Sizing ────────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
// ~78% of screen, capped at 320 — same formula as JOB_CARD_WIDTH in JobCard.tsx
export const ESEK_CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.78), 320);

// ── Props ────────────────────────────────────────────────────────────────────

export interface EsekCardProps {
  item: MarketplaceItem;
  /** Renders at 100% of the container width instead of ESEK_CARD_WIDTH — for
   * the vertical, single-type feed (TribeEsekList) rather than the carousel. */
  fullWidth?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function EsekCard({ item, fullWidth }: EsekCardProps) {
  const { colors } = useTheme();

  // Silent degradation when the image request fails (mirror JobCard.logoFailed)
  const [imageFailed, setImageFailed] = useState(false);

  // Coerce defensively: Postgres numeric can arrive as a string, on which .toFixed()
  // throws and `>` would compare lexicographically. Number() makes both robust.
  const price = Number(item.price);
  const compareAtPrice =
    item.compareAtPrice == null ? null : Number(item.compareAtPrice);
  const onSale = compareAtPrice != null && compareAtPrice > price;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Open the product page in SFSafariViewController (iOS) / Chrome Custom Tabs (Android). */
  const handleOpen = useCallback(async () => {
    try {
      Haptics.selectionAsync();
      // Fire-and-forget click attribution — must never block or break the open.
      if (item.source === 'esek') {
        esekApi.trackClick(item.shopifyId).catch(() => {});
      } else {
        marketplaceApi.trackTribelifeClick(item.id).catch(() => {});
      }
      // Attribute the outbound click to TribeLife via UTM params.
      const sep = item.productUrl.includes('?') ? '&' : '?';
      const url = `${item.productUrl}${sep}utm_source=tribelife_app&utm_medium=marketplace`;
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // user dismissed or browser unavailable — silent
    }
  }, [item]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Pressable
      onPress={handleOpen}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open product: ${item.title}`}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
            width: fullWidth ? '100%' : ESEK_CARD_WIDTH,
          },
        ]}
      >
        {/* Product image at the top — ~75% of the tile, square, cover */}
        {imageFailed ? (
          <View style={[styles.image, { backgroundColor: colors.surface }]} />
        ) : (
          <Image
            source={{ uri: item.imageUrl }}
            style={[styles.image, { backgroundColor: colors.surface }]}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        )}

        <View style={styles.body}>
          {/* Title — up to 3 lines */}
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {/* Price row — $price, plus struck-through compareAtPrice when on sale */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>
              ${price.toFixed(2)}
            </Text>
            {onSale && (
              <Text
                style={[styles.compareAt, { color: colors.textMuted }]}
              >
                ${compareAtPrice!.toFixed(2)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default EsekCard;

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
  image: {
    width: '100%',
    aspectRatio: 16 / 9, // match NewsCard so cards share the same image height
  },
  body: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
    lineHeight: 21,
    // Reserve exactly 2 lines (2 × lineHeight) so short and long titles yield
    // identical card heights across the carousel.
    minHeight: 42,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  price: {
    fontFamily: FONTS.bold,
    fontSize: 16,
  },
  compareAt: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    textDecorationLine: 'line-through',
  },
});
