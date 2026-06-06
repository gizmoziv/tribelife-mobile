// RegionGlobe.tsx — 3-region PROTOTYPE (north-america, israel, uk-ireland).
//
// Renders a small orthographic globe disc with that region's landmasses
// highlighted/glowing in the region's accent color. SVG path data is
// pre-baked by scripts/generate-region-globes.mjs — no d3-geo at runtime.
//
// Any slug NOT in REGION_GLOBES falls back gracefully to <RegionTile>
// (same discipline as TimezoneFlag.tsx). This keeps all other region slugs
// and any future slugs working untouched.
//
// Shell layout mirrors RegionTile/TimezoneFlag exactly:
//   showRing=true  → gradient outer ring + background-colored padding disc
//   showRing=false → shadowWrap only (used in flat list contexts)
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, ClipPath, Circle, Path } from 'react-native-svg';
import { COLORS, GLOBE_ROOM_VISUALS, SHADOWS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { RegionTile } from '@/components/ui/RegionTile';
import { REGION_GLOBES } from '@/constants/regionGlobes.generated';

// ── Glow tunables ─────────────────────────────────────────────────────────────
// Approximating blur/glow with a semi-transparent wider-stroke underlay path
// (react-native-svg has no reliable cross-platform filter blur). Adjust these
// if the glow reads too faint or too harsh at real tile size on device.
const GLOW_STROKE_WIDTH = 6;   // width of the accent underlay stroke (glow halo)
const GLOW_STROKE_OPACITY = 0.35; // opacity of the glow underlay
const WORLD_FILL = 'rgba(120,140,175,0.45)';  // muted world landmass color
const OCEAN_FILL = 'rgba(15,30,70,0.80)';     // disc background (ocean)

export type RegionGlobeProps = {
  slug: string;
  size?: number;
  showRing?: boolean;
};

export function RegionGlobe({ slug, size = 56, showRing = true }: RegionGlobeProps) {
  const { colors } = useTheme();
  const data = REGION_GLOBES[slug];

  // Graceful fallback: slug not in baked data → abbreviation tile.
  if (!data) {
    return <RegionTile slug={slug} size={size} showRing={showRing} />;
  }

  const accent = GLOBE_ROOM_VISUALS[slug]?.accent ?? COLORS.primary;

  // The SVG paths were baked into a 200×200 viewBox. We render them into
  // a <size>×<size> canvas; the viewBox handles the scaling automatically.
  const globe = (
    <Svg width={size} height={size} viewBox={data.viewBox}>
      <Defs>
        {/* Clip everything to a circle so the disc edges are clean. */}
        <ClipPath id={`globeClip-${slug}`}>
          <Circle cx={100} cy={100} r={100} />
        </ClipPath>
      </Defs>

      {/* Ocean disc background */}
      <Circle cx={100} cy={100} r={100} fill={OCEAN_FILL} />

      {/* World landmasses — muted backdrop */}
      <Path
        d={data.world}
        fill={WORLD_FILL}
        clipPath={`url(#globeClip-${slug})`}
      />

      {/* Glow underlay — wider semi-transparent stroke on the region path */}
      <Path
        d={data.region}
        fill="none"
        stroke={accent}
        strokeWidth={GLOW_STROKE_WIDTH}
        strokeOpacity={GLOW_STROKE_OPACITY}
        clipPath={`url(#globeClip-${slug})`}
      />

      {/* Highlighted region — solid accent fill */}
      <Path
        d={data.region}
        fill={accent}
        clipPath={`url(#globeClip-${slug})`}
      />
    </Svg>
  );

  if (!showRing) {
    return (
      <View
        style={[
          styles.shadowWrap,
          { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
        ]}
      >
        {globe}
      </View>
    );
  }

  // Mirror RegionTile/TimezoneFlag ring layout:
  //   gradient outer ring → background-colored padding → inner disc
  const ringWidth = 2;
  const outerSize = size + ringWidth * 2 + 4;

  return (
    <View
      style={[styles.shadowWrap, { width: outerSize, height: outerSize, borderRadius: outerSize / 2 }]}
    >
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
            overflow: 'hidden',
          }}
        >
          {globe}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    ...SHADOWS.sm,
  },
});

export default RegionGlobe;
