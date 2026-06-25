// Phase 24: horizontal job card for the Tribe hub carousel.
//
// A fixed-width (~78% screen width, max 320px) card variant, structural clone of NewsCard:
//   - Company logo (40×40) + job title header row (replaces 16:9 OG image)
//   - Always-shown 2-line truncated description abstract
//   - Footer: company · location|Remote · MM/DD/YYYY
//   - Tap → open job posting in in-app WebBrowser (SFSafariViewController / CCT)
//   - No reactions, no save — lean card optimised for carousel scanning
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';
import type { JobPosting } from '@/types';

// ── Sizing ────────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get('window').width;
// ~78% of screen, capped at 320 — same formula as NEWS_CARD_WIDTH in NewsCard.tsx
export const JOB_CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.78), 320);

// ── Props ────────────────────────────────────────────────────────────────────

export interface JobCardProps {
  job: JobPosting;
}

// ── Component ────────────────────────────────────────────────────────────────

export function JobCard({ job }: JobCardProps) {
  const { colors } = useTheme();

  // Silent degradation when logo URL is null or the image request fails
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!job.logoUrl && !logoFailed;

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** JOBS-08: open job posting in SFSafariViewController (iOS) / Chrome Custom Tabs (Android). */
  const handleOpen = useCallback(async () => {
    try {
      Haptics.selectionAsync();
      await WebBrowser.openBrowserAsync(job.jobUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      // user dismissed or browser unavailable — silent
    }
  }, [job.jobUrl]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Pressable
      onPress={handleOpen}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open job: ${job.title}`}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
            width: JOB_CARD_WIDTH,
          },
        ]}
      >
        <View style={styles.body}>
          {/* Logo + title header row — replaces the 16:9 OG image */}
          <View style={styles.headerRow}>
            {showLogo ? (
              <Image
                source={{ uri: job.logoUrl! }}
                style={[styles.logo, { backgroundColor: colors.surface }]}
                resizeMode="contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <View style={[styles.logo, { backgroundColor: colors.surface }]} />
            )}
            <Text
              style={[styles.headline, { color: colors.text, flex: 1 }]}
              numberOfLines={2}
            >
              {job.title}
            </Text>
          </View>

          {/* Description abstract — always shown (not conditional on logo) */}
          {!!job.description && (
            <Text
              style={[styles.summary, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {job.description}
            </Text>
          )}

          {/* Footer: company · location|Remote · MM/DD/YYYY */}
          <Text
            style={[styles.outlet, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {job.company} · {job.location ?? 'Remote'} · {job.postedDate}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default JobCard;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.md,
    // Avoid elevation conflicts with borderRadius on Android
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  body: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  headline: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    lineHeight: 21,
  },
  summary: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  outlet: {
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
});
