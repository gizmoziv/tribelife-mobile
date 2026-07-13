import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS } from '@/constants';

// ── Viber-style chat date separator ──────────────────────────────────────────
// A centered, subtly translucent pill with muted text, rendered inline in the
// message stream above the first message of each calendar day. Also reused by
// the floating sticky date header (same label formatting) via useStickyChatDate.
export interface ChatDateSeparatorProps {
  label: string;
}

export function ChatDateSeparator({ label }: ChatDateSeparatorProps) {
  const { colors } = useTheme();
  if (!label) return null;
  return (
    <View style={styles.row} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor: colors.surfaceGlass }]}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

export default ChatDateSeparator;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  label: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
});
