import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useCapability } from '@/hooks/useCapability';
import { COLORS, FONTS, SPACING } from '@/constants';
import { chat as chatApi } from '@/services/api';
import type { LinkClickStat } from '@/services/api';
import { messageLinkKeys } from '@/utils/messageLinks';
import { buildLinkClicksViewModel } from '@/utils/linkClicksViewModel';

// ── quick 261003-nfu: Link clicks section of the message Info sheet ─────────
// Sits ABOVE the Seen/Delivered list (D2). Everything it shows comes from the
// pure view-model (utils/linkClicksViewModel.ts):
//   - no links in the message        → nothing
//   - free sender (D1)               → one locked teaser row, NO request made
//   - premium sender                 → loading / error + Try again / empty /
//                                      one row per link with Clicks + Unique people
// Fetches only when the sheet is visible, the capability allows it and the
// message has links.

interface LinkClicksSectionProps {
  visible: boolean;
  // Server id of the message; null/<=0 for optimistic (unsent) messages.
  messageId: number | null;
  content: string | null;
  // Tapped on the locked teaser (free sender): the screen shows the upsell.
  onUpgradePress: () => void;
}

// ── Inline icons ─────────────────────────────────────────────────────────────
function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 11h14v10H5z" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

function ChevronIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

function LinkIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  );
}

function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

export function LinkClicksSection({ visible, messageId, content, onUpgradePress }: LinkClicksSectionProps) {
  const { colors } = useTheme();
  const canView = useCapability('canViewLinkAnalytics');

  // Optimistic or unsent messages show nothing.
  const linkCount = useMemo(
    () => (messageId != null && messageId > 0 && content ? messageLinkKeys(content).length : 0),
    [messageId, content],
  );
  const canFetch = visible && canView && linkCount > 0;

  const [stats, setStats] = useState<LinkClickStat[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Drops responses that arrive after the sheet closed, the message changed or
  // a newer request started.
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!canFetch || messageId == null) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setError(false);
    try {
      const res = await chatApi.getLinkAnalytics(messageId);
      if (seq === seqRef.current) setStats(res.links);
    } catch {
      if (seq === seqRef.current) setError(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [canFetch, messageId]);

  useEffect(() => {
    seqRef.current += 1;
    setStats(null);
    setError(false);
    setLoading(false);
    // A free user makes NO request (D1). If the server answers
    // capabilityViolation, request() refreshes capabilities, canView flips
    // false and the teaser shows.
    if (canFetch) void load();
  }, [visible, messageId, canFetch, load]);

  const vm = buildLinkClicksViewModel({ linkCount, canView, loading, error, stats });

  if (vm.kind === 'hidden') return null;

  if (vm.kind === 'locked') {
    return (
      <>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onUpgradePress();
          }}
          accessibilityRole="button"
          accessibilityLabel={vm.a11yLabel}
          accessibilityHint="Opens Premium upgrade"
          style={styles.lockedRow}
        >
          <View style={[styles.iconHolder, { backgroundColor: COLORS.primary + '22' }]}>
            <LockIcon color={COLORS.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.lockedTitle, { color: colors.text }]}>{vm.title}</Text>
            <Text style={[styles.lockedBody, { color: colors.textMuted }]} numberOfLines={2}>
              {vm.body}
            </Text>
          </View>
          <ChevronIcon color={colors.textMuted} />
        </Pressable>
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      </>
    );
  }

  return (
    <>
      <Text accessibilityRole="header" style={[styles.header, { color: colors.textMuted }]}>
        {vm.header}
      </Text>

      {vm.kind === 'loading' && (
        <View style={styles.stateRow}>
          <ActivityIndicator color={colors.textMuted} accessibilityLabel={vm.a11yLabel} />
        </View>
      )}

      {vm.kind === 'error' && (
        <View style={styles.errorBlock}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>{vm.message}</Text>
          <Pressable
            onPress={() => { void load(); }}
            accessibilityRole="button"
            accessibilityLabel="Try again loading link clicks"
            style={styles.retry}
          >
            <Text style={styles.retryText}>{vm.retryLabel}</Text>
          </Pressable>
        </View>
      )}

      {vm.kind === 'empty' && (
        <View style={styles.stateRow}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{vm.message}</Text>
        </View>
      )}

      {vm.kind === 'rows' &&
        vm.rows.map((row, index) => (
          <React.Fragment key={row.key}>
            {index > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
            <View accessible accessibilityLabel={row.a11yLabel} style={styles.row}>
              <View style={[styles.iconHolder, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                {row.icon === 'youtube' ? <PlayIcon color={COLORS.primary} /> : <LinkIcon color={colors.text} />}
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.label, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {row.label}
                </Text>
                <Text style={[styles.statLine, { color: colors.textMuted }]}>
                  {'Clicks '}
                  <Text style={[styles.statValue, { color: colors.text }]}>{row.clicksText}</Text>
                  {'   Unique people '}
                  <Text style={[styles.statValue, { color: colors.text }]}>{row.uniqueText}</Text>
                </Text>
              </View>
              {/* Reserved trailing slot for a future who-clicked chevron (PD-13).
                  Rows are intentionally not pressable and no who-clicked view is
                  built yet (D2), so nothing looks tappable. */}
              <View style={styles.trailingSlot} />
            </View>
          </React.Fragment>
        ))}

      <View style={[styles.separator, styles.sectionEnd, { backgroundColor: colors.border }]} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.8,
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SPACING.page,
  },
  sectionEnd: {
    marginTop: SPACING.sm,
  },
  lockedRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  lockedTitle: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  lockedBody: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 1,
  },
  iconHolder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  errorBlock: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  errorText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 15,
    fontFamily: FONTS.medium,
  },
  statLine: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 1,
  },
  statValue: {
    fontFamily: FONTS.semiBold,
  },
  trailingSlot: {
    width: 16,
  },
});

export default LinkClicksSection;
