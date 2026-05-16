// Phase 12 polish v2: monochromatic premium region tile.
//
// All regions share the same dark gradient — the differentiator is the
// 2-letter abbreviation in white type and a thin accent stripe at the
// bottom in the region's legacy tint. Reads as a quiet, refined set of
// tiles rather than a rainbow row of saturated circles.
//
// Used by both Chevra (app/(app)/globe/index.tsx) and the Chats list
// globe_room rows (app/(app)/chat/index.tsx) so joined regional rooms
// look consistent across surfaces.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  COLORS,
  FONTS,
  GLOBE_ROOM_VISUALS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
  SHADOWS,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';

type RegionTileProps = {
  slug: string;
  size?: number;
};

export function RegionTile({ slug, size = 44 }: RegionTileProps) {
  const { isDark } = useTheme();
  const visual = GLOBE_ROOM_VISUALS[slug];
  const abbreviation = visual?.abbreviation ?? '··';
  const accent = visual?.accent ?? COLORS.primary;
  const radius = size / 2;

  const gradient = isDark
    ? REGION_TILE_GRADIENT_DARK
    : REGION_TILE_GRADIENT_LIGHT;
  const labelColor = isDark ? '#FFFFFF' : '#1F2940';
  // Stripe sits as a thin arc at the bottom of the circle — premium fintech
  // recognition cue without coloring the whole tile.
  const stripeHeight = Math.max(3, Math.round(size * 0.08));

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
        {/* Subtle top-edge glass highlight for depth. */}
        <LinearGradient
          colors={[
            isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
          pointerEvents="none"
        />

        <Text
          style={{
            fontFamily: FONTS.semiBold,
            fontSize: Math.round(size * 0.34),
            color: labelColor,
            letterSpacing: 0.6,
          }}
          numberOfLines={1}
        >
          {abbreviation}
        </Text>

        {/* Accent stripe — thin colored arc anchored to the bottom edge. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: size * 0.18,
            right: size * 0.18,
            bottom: size * 0.12,
            height: stripeHeight / 2,
            borderRadius: stripeHeight,
            backgroundColor: accent,
            opacity: 0.85,
          }}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    ...SHADOWS.sm,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
