import React from 'react';
import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AvatarCircle } from './AvatarCircle';
import { RoleBadge } from './RoleBadge';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS } from '@/constants';
import type { OrgRole } from '@/types';

interface OrgCardProps {
  orgId: number;
  slug: string;
  name: string;
  iconUrl: string | null;
  role: OrgRole;
  onPress?: () => void;
}

export function OrgCard({ name, iconUrl, role, onPress }: OrgCardProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${role}`}
      hitSlop={8}
      style={styles.row}
    >
      {iconUrl ? (
        <Image source={{ uri: iconUrl }} style={styles.icon} />
      ) : (
        <AvatarCircle name={name} size={44} showRing={false} />
      )}
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.right}>
        <RoleBadge role={role} size="sm" />
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </View>
    </Pressable>
  );
}

export default OrgCard;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
    minHeight: 44,
  },
  icon: { width: 44, height: 44, borderRadius: RADIUS.pill },
  name: { flex: 1, fontSize: 15, fontFamily: FONTS.semiBold },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  chevron: { fontSize: 18, lineHeight: 18 },
});
