// Phase 12 polish v3: monochromatic premium region tile + gradient ring.
//
// All regions share the same dark gradient tile. The differentiator is the
// 2-letter abbreviation in white type and a thin accent stripe at the
// bottom in the region's legacy tint. Wrapped in the same gradient ring
// AvatarCircle uses so globe rooms read as first-class avatars in the
// Chevra + Chats-list surfaces.
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
  showRing?: boolean;
  // Phase 18: explicit abbreviation override for slugs not in GLOBE_ROOM_VISUALS
  // (e.g. timezone-zone fallback when a country flag is unavailable). Prevents
  // the generic '··' placeholder from ever rendering.
  abbreviation?: string;
};

export function RegionTile({ slug, size = 44, showRing = true, abbreviation: abbrOverride }: RegionTileProps) {
  const { isDark, colors } = useTheme();
  const visual = GLOBE_ROOM_VISUALS[slug];
  const abbreviation = visual?.abbreviation ?? abbrOverride ?? '··';

  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const labelColor = isDark ? '#FFFFFF' : '#1F2940';

  const tile = (
    <LinearGradient
      colors={[gradient[0], gradient[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      {/* Top-edge glass highlight. */}
      <LinearGradient
        colors={[
          isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
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
    </LinearGradient>
  );

  if (!showRing) {
    return (
      <View style={[styles.shadowWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        {tile}
      </View>
    );
  }

  // Mirror AvatarCircle's ring layout: gradient outer + background-colored
  // padding so the inner tile reads as a separate disc inside the ring.
  const ringWidth = 2;
  const outerSize = size + ringWidth * 2 + 4;
  return (
    <View style={[styles.shadowWrap, { width: outerSize, height: outerSize, borderRadius: outerSize / 2 }]}>
      <LinearGradient
        colors={[...COLORS.gradientPrimary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          alignItems: 'center',
          justifyContent: 'center',
          padding: ringWidth,
        }}
      >
        <View
          style={{
            width: size + 2,
            height: size + 2,
            borderRadius: (size + 2) / 2,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {tile}
        </View>
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
