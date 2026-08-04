// Tribe Hub filter pills — same visual recipe as the Chats tab's pill row
// (app/(app)/chat/index.tsx ~line 591-639): independent chips with their own
// backgrounds, not a segmented control with a sliding indicator. Single-select;
// tapping the active pill is a no-op.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, RADIUS, SPACING } from '@/constants';

export type TribeFilterKey = 'all' | 'news' | 'jobs' | 'marketplace';

const OPTIONS: { key: TribeFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'news', label: 'News' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'marketplace', label: 'Marketplace' },
];

interface TribeFilterPillsProps {
  value: TribeFilterKey;
  onChange: (key: TribeFilterKey) => void;
}

export function TribeFilterPills({ value, onChange }: TribeFilterPillsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.pillsRow}>
      {OPTIONS.map(({ key, label }) => {
        const isActive = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => {
              if (isActive) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(key);
            }}
            style={[
              styles.pillChip,
              isActive
                ? { backgroundColor: 'rgba(129, 140, 248, 0.85)', borderColor: 'rgba(129, 140, 248, 0.95)' }
                : { backgroundColor: colors.surfaceGlass, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.pillChipText,
                isActive
                  ? { color: '#FFFFFF', fontFamily: FONTS.semiBold }
                  : { color: colors.textMuted, fontFamily: FONTS.medium },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default TribeFilterPills;

const styles = StyleSheet.create({
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  pillChipText: {
    fontSize: 13,
  },
});
