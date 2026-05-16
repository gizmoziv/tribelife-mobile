// Phase 12 polish: shared region-avatar tile for Chevra rows + Chats-list
// globe_room rows. Replaces the v1.7 solid-color circle with a soft diagonal
// gradient + stylized continent silhouette on top — same component drives
// both surfaces so the visual stays consistent when a regional room is
// joined and surfaces in the Chats tab.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS, GLOBE_ROOM_VISUALS, SHADOWS } from '@/constants';

type RegionTileProps = {
  slug: string;
  size?: number;
};

export function RegionTile({ slug, size = 44 }: RegionTileProps) {
  const visual = GLOBE_ROOM_VISUALS[slug];
  const gradient = visual?.gradient ?? [COLORS.primary, COLORS.primaryDark];
  const silhouette = visual?.silhouette;
  const radius = size / 2;
  // Silhouette renders at ~58% of tile diameter; gives breathing room and
  // keeps the continent shape readable even at small list sizes (44px).
  const glyphSize = Math.round(size * 0.58);

  return (
    <View style={[styles.shadowWrap, { width: size, height: size, borderRadius: radius }]}>
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: radius,
          },
        ]}
      >
        {/* Subtle top-edge glass highlight — extra polish for premium feel. */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius: radius },
          ]}
          pointerEvents="none"
        />
        {silhouette ? (
          <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24">
            <Path d={silhouette} fill="rgba(255,255,255,0.88)" />
          </Svg>
        ) : (
          // Town Square fallback — generic stylized globe glyph (no specific region).
          <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={9} stroke="rgba(255,255,255,0.9)" strokeWidth={1.6} />
            <Path
              d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    // Soft drop shadow for depth — tuned low so the tile sits, doesn't float.
    ...SHADOWS.sm,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
