import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  FONTS,
  RADIUS,
  SHADOWS,
  COLORS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
  GLOBE_ROOM_VISUALS,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { RegionTile } from '@/components/ui/RegionTile';
import { TimezoneFlag } from '@/components/ui/chevra/TimezoneFlag';
import { RegionGlobe } from '@/components/ui/chevra/RegionGlobe';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import type { ChevraRow } from '@/types';

// Plan 15-05 (TZRM-02): ChevraCommunityTile now renders all three ChevraRow
// variants — globe_room, group, and the new timezone_room (added by Plan
// 15-04 backend + types mirror). Paywalled timezone_room rows render with a
// lock icon overlay and a generic "Timezone community" subtitle; joinable
// rows render with the member count + lastMessage preview when available.
//
// The earlier Plan 15-04 `ChevraGlobeOrGroup` narrowing is lifted here —
// the consumer (`globe/index.tsx`) now passes the full union.

type ChevraCommunityTileProps = {
  item: ChevraRow;
  width: number;
  onPress: () => void;
};

// Inline lock icon — matches the project's "render small SVG inline" pattern
// (CLAUDE.md "Component Patterns") instead of pulling in a heavier icon set.
function LockIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 10V8a6 6 0 1112 0v2m-9 4h6m-9 0a2 2 0 00-2 2v4a2 2 0 002 2h12a2 2 0 002-2v-4a2 2 0 00-2-2H6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevraCommunityTile({ item, width, onPress }: ChevraCommunityTileProps) {
  const { isDark } = useTheme();
  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const labelColor = isDark ? COLORS.text : COLORS.lightText;
  const mutedColor = isDark ? COLORS.textMuted : COLORS.lightTextMuted;

  // ── Discriminate the three variants up-front so each render branch reads
  //    cleanly. avatar / displayName / metaCount / metaLabel / eyebrow /
  //    accent / paywalled are all derived here.
  let avatar: React.ReactNode;
  let displayName: string;
  let metaCount: number;
  let metaLabel: string;
  let eyebrow: string;
  let accent: string;
  let paywalled = false;

  if (item.kind === 'group') {
    avatar = (
      <AvatarCircle name={item.name} size={56} imageUrl={item.iconUrl ?? undefined} />
    );
    displayName = item.name;
    metaCount = item.memberCount;
    metaLabel = item.memberCount === 1 ? 'member' : 'members';
    eyebrow = 'COMMUNITY';
    accent = COLORS.primary;
  } else if (item.kind === 'globe_room') {
    // All 7 region globes are baked. RegionGlobe self-scopes: it renders the
    // baked globe for slugs in REGION_GLOBES and falls back to the RegionTile
    // abbreviation for any slug that isn't (e.g. town-square).
    avatar = <RegionGlobe slug={item.slug} size={56} />;
    displayName = item.displayName;
    metaCount = item.participantCount;
    metaLabel = 'online';
    eyebrow = 'REGION';
    accent = GLOBE_ROOM_VISUALS[item.slug]?.accent ?? COLORS.primary;
  } else {
    // Phase 15 TZRM-02: timezone_room variant.
    // Phase 18: country flag instead of the '··' RegionTile placeholder.
    avatar = <TimezoneFlag slug={item.slug} size={56} />;
    displayName = item.displayName;
    metaCount = item.memberCount;
    metaLabel = item.memberCount === 1 ? 'member' : 'members';
    eyebrow = 'TIMEZONE';
    accent = COLORS.primary;
    paywalled = item.paywalled;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        SHADOWS.sm,
        { width },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.surface}
      >
        <LinearGradient
          colors={[
            isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.content}>
          <View style={styles.avatarRow}>
            {avatar}
            {paywalled && (
              <View
                style={[
                  styles.lockBadge,
                  { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)' },
                ]}
              >
                <LockIcon size={14} color={labelColor} />
              </View>
            )}
          </View>

          <Text style={[styles.eyebrow, { color: mutedColor }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[styles.name, { color: labelColor }]} numberOfLines={2}>
            {displayName}
          </Text>

          <View style={styles.metaRow}>
            {item.kind === 'globe_room' && (
              <Svg width={8} height={8} viewBox="0 0 8 8" style={{ marginRight: 6 }}>
                <Circle cx={4} cy={4} r={4} fill={COLORS.secondary} />
              </Svg>
            )}
            <Text style={[styles.metaText, { color: mutedColor }]} numberOfLines={1}>
              {metaCount} {metaLabel}
            </Text>
          </View>
        </View>

        <View style={[styles.accentStripe, { backgroundColor: accent }]} pointerEvents="none" />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  surface: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    minHeight: 184,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 18,
  },
  avatarRow: {
    alignItems: 'flex-start',
    marginBottom: 10,
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    left: 38,
    top: 38,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  name: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    lineHeight: 20,
    marginTop: 4,
    minHeight: 40,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  metaText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
  },
  accentStripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    opacity: 0.85,
  },
});
