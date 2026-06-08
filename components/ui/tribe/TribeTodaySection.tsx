// TribeTodaySection — wired to /api/tribe/today (Plan 18-03).
// Fetches on mount; parsha + Daf Yomi render immediately from server data.
// CandleLightingCard handles the location prompt / times states.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { FONTS, SPACING, COLORS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { tribeApi, TodayPayload } from '@/services/api';
import type { DailyBanner } from '@/components/ui/chevra/dailyContent';
import { ChevraTodaySection } from '@/components/ui/chevra/ChevraTodaySection';
import { CandleLightingCard } from './CandleLightingCard';

export function TribeTodaySection() {
  const { colors } = useTheme();

  const [data, setData] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchToday = useCallback(async () => {
    setError(null);
    try {
      const result = await tribeApi.today();
      setData(result);
    } catch {
      setError("Couldn't load today's content.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchToday();
  }, [fetchToday]);

  // Build the DailyBanner shape from server shabbat data.
  // shabbat carries hebrewDate, gregorianLabel, parshaName, parshaHebrew from 18-02.
  const banner: DailyBanner = data?.shabbat
    ? {
        hebrewDate: data.shabbat.hebrewDate,
        gregorianLabel: data.shabbat.gregorianLabel,
        parshaName: data.shabbat.parshaName,
        parshaHebrew: data.shabbat.parshaHebrew,
      }
    : {
        hebrewDate: '',
        gregorianLabel: 'Today',
        parshaName: '',
        parshaHebrew: '',
      };

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>Today</Text>
        <View style={[styles.skeleton, { backgroundColor: colors.surface }]}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </View>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>Today</Text>
        <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {error}
          </Text>
        </View>
      </View>
    );
  }

  // ── Loaded state ─────────────────────────────────────────────────────────

  return (
    <View style={styles.section}>
      {/* <Text style={[styles.title, { color: colors.text }]}>Today</Text> */}

      <View style={styles.content}>
        {/* Parsha banner + Daf Yomi tiles — always rendered, never blocked by location */}
        {/* <ChevraTodaySection
          banner={banner}
          shabbat={data?.shabbat ?? null}
          daf={data?.daf ?? null}
        /> */}

        {/* Candle-lighting card — prompts for location if needed, shows times once set */}
        <CandleLightingCard today={data} onChanged={fetchToday} />
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  content: {
    paddingHorizontal: SPACING.page,
    gap: 12,
  },
  skeleton: {
    marginHorizontal: SPACING.page,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    marginHorizontal: SPACING.page,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
});
