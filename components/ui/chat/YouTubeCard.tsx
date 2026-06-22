import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, RADIUS } from '@/constants';
import { fetchYouTubeOEmbed, getThumbnailUrl } from '@/utils/youtube';

interface YouTubeCardProps {
  videoId: string;
  onPress: (videoId: string) => void;
}

// Centered play triangle, mirroring the inline-SVG icon pattern used in
// ImageViewer / MessageBubble. White fill reads on the dark scrim circle.
function PlayIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M8 5v14l11-7z" fill="#FFF" />
    </Svg>
  );
}

/**
 * Inline chat unfurl card for a single YouTube video. Renders just a thumbnail
 * Image + ▶ overlay + (when available) title/channel — NO live player. The
 * card paints immediately from the derived thumbnail; title + channel fill in
 * asynchronously from oEmbed without remounting. Tapping calls onPress(videoId)
 * so the parent can open the full-screen player modal.
 */
export function YouTubeCard({ videoId, onPress }: YouTubeCardProps) {
  const { colors } = useTheme();
  const [thumbQuality, setThumbQuality] = useState<'hq' | 'mq'>('hq');
  const [meta, setMeta] = useState<{ title: string; channel: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reset per-video state so a recycled card row never shows stale meta.
    setThumbQuality('hq');
    setMeta(null);
    fetchYouTubeOEmbed(videoId).then((result) => {
      if (!cancelled && result) setMeta(result);
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  return (
    <Pressable
      onPress={() => onPress(videoId)}
      style={[
        styles.card,
        { backgroundColor: colors.surfaceGlass, borderColor: colors.border },
      ]}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: getThumbnailUrl(videoId, thumbQuality) }}
          style={styles.thumb}
          resizeMode="cover"
          onError={() => {
            if (thumbQuality === 'hq') setThumbQuality('mq');
          }}
        />
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <PlayIcon />
          </View>
        </View>
      </View>
      {meta && (
        <View style={styles.metaRow}>
          {!!meta.title && (
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={2}
            >
              {meta.title}
            </Text>
          )}
          {!!meta.channel && (
            <Text
              style={[styles.channel, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {meta.channel}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

export default YouTubeCard;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginTop: 6,
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2, // optically center the triangle
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
  channel: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
});
