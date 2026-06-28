import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';
import { linkPreviewApi } from '@/services/api';
import type { LinkPreview } from '@/types';

interface LinkPreviewCardProps {
  url: string;
  onPress: (url: string) => void;
}

// Derive a clean hostname for the muted footer line when the backend gives us
// no siteName. Falls back to the raw url string if it can't be parsed.
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Viber-style rich unfurl card for the first non-YouTube link in a chat
 * message. Fetches Open Graph metadata from the backend on mount, keyed by url.
 * While loading it renders nothing; if the preview is null OR has no title AND
 * no image it also renders nothing — the link still shows as tappable text in
 * the message, so this card is purely additive and degrades gracefully.
 *
 * Layout: an og:image hero on top (full card width, only when an image is
 * present), then a footer strip with the title and the siteName/hostname.
 * Tapping calls onPress(url) so the parent reuses its existing URL opener.
 */
export function LinkPreviewCard({ url, onPress }: LinkPreviewCardProps) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState<LinkPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset per-url so a recycled card row never shows a stale unfurl.
    setPreview(null);
    linkPreviewApi
      .getLinkPreview(url)
      .then((result) => {
        if (!cancelled) setPreview(result.preview);
      })
      .catch(() => {
        // Graceful: a failed fetch leaves preview null → no card renders.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Nothing usable yet (loading) or nothing usable at all → render no card.
  if (!preview) return null;
  if (!preview.title && !preview.image) return null;

  const footerLabel = preview.siteName || hostnameOf(preview.url || url);

  return (
    <Pressable
      onPress={() => onPress(url)}
      style={[
        styles.card,
        { backgroundColor: colors.surfaceGlass, borderColor: colors.border },
      ]}
    >
      {!!preview.image && (
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: preview.image }}
            style={styles.hero}
            resizeMode="cover"
          />
        </View>
      )}
      <View style={styles.metaRow}>
        {!!preview.title && (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}
        {!!footerLabel && (
          <Text
            style={[styles.site, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {footerLabel}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default LinkPreviewCard;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 18, // match the bubble / YouTube card / flush-image corner radius
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  heroWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  metaRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    lineHeight: 18,
  },
  site: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
});
