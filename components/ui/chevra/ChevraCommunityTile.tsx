import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
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
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import type { ChevraRow } from '@/types';

type ChevraCommunityTileProps = {
  item: ChevraRow;
  width: number;
  onPress: () => void;
};

export function ChevraCommunityTile({ item, width, onPress }: ChevraCommunityTileProps) {
  const { isDark } = useTheme();
  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const labelColor = isDark ? COLORS.text : COLORS.lightText;
  const mutedColor = isDark ? COLORS.textMuted : COLORS.lightTextMuted;

  const isGroup = item.kind === 'group';
  const accent = isGroup
    ? COLORS.primary
    : GLOBE_ROOM_VISUALS[item.slug]?.accent ?? COLORS.primary;
  const displayName = isGroup ? item.name : item.displayName;
  const metaCount = isGroup ? item.memberCount : item.participantCount;
  const metaLabel = isGroup
    ? (item.memberCount === 1 ? 'member' : 'members')
    : 'online';
  const eyebrow = isGroup ? 'GROUP' : 'REGION';

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
            {isGroup ? (
              <AvatarCircle name={item.name} size={56} imageUrl={item.iconUrl ?? undefined} />
            ) : (
              <RegionTile slug={item.slug} size={56} />
            )}
          </View>

          <Text style={[styles.eyebrow, { color: mutedColor }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[styles.name, { color: labelColor }]} numberOfLines={2}>
            {displayName}
          </Text>

          <View style={styles.metaRow}>
            {!isGroup && (
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
