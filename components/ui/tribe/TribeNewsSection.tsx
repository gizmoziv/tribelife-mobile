// Phase 18-01: Tribe Hub — News section skeleton.
// Renders a titled placeholder that 18-04 will replace with the horizontal
// news-article carousel (FlatList, horizontal scroll).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING } from '@/constants';

export function TribeNewsSection() {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>News</Text>
      {/* Skeleton placeholder — horizontal carousel built in 18-04 */}
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
    height: 120,
    borderRadius: 12,
  },
});
