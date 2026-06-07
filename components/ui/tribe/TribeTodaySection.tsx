// Phase 18-01: Tribe Hub — Today section skeleton.
// Renders a titled placeholder that 18-03 will replace with the real
// ChevraTodaySection / DailyBanner wired to /api/tribe/today.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, COLORS } from '@/constants';

export function TribeTodaySection() {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>Today</Text>
      {/* Skeleton placeholder — wired to real data in 18-03 */}
      <View style={[styles.placeholder, { backgroundColor: colors.surface }]} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 18,
    paddingHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
  },
  placeholder: {
    marginHorizontal: SPACING.page,
    height: 80,
    borderRadius: 12,
  },
});
