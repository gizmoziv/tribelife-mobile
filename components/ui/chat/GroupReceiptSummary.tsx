import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import type { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING } from '@/constants';
import type { GroupMember, MemberReceipt } from '@/types';

// ThemeColors is not exported from ThemeContext; derive it from useTheme's
// return so the line colour stays in lockstep with the theme without an
// out-of-scope export change (mirrors MessageTicks, 29-03).
type ThemeColors = ReturnType<typeof useTheme>['colors'];

// ── Phase 29: GroupReceiptSummary (D-03, RCPT-04/05) ────────────────────────
// The group aggregate "Delivered to N · Seen by N" line. Presentational +
// self-computing from the receiptsStore slice; the SCREEN decides WHERE it
// renders (only under the latest own group message — Pitfall 6, Task 2).
//
// Tap target: the line ITSELF is wrapped in a Pressable (D-03) — NOT the whole
// bubble — so opening the breakdown sheet never collides with the bubble's
// long-press reaction/reply menu.
//
// Counts derive from the group member roster (excluding me) crossed with this
// conversation's receipt watermarks:
//   Delivered to N = members where deliveredUpTo != null && deliveredUpTo >= createdAt
//   Seen by N      = members where readUpTo     != null && readUpTo     >= createdAt
//   total          = roster length
// ISO strings compare lexicographically (both UTC toISOString output), matching
// the deriveTick comparison in MessageBubble.
//
// Graceful pre-deploy state (constraint 5): before the Phase 28 backend ships,
// `receipts` is empty/undefined → "Delivered to 0 · Seen by 0", no crash.

export function countDelivered(
  roster: GroupMember[],
  receipts: Record<number, MemberReceipt> | undefined,
  createdAt: string,
): number {
  if (!receipts) return 0;
  return roster.reduce((n, m) => {
    const r = receipts[m.userId];
    return r?.deliveredUpTo != null && r.deliveredUpTo >= createdAt ? n + 1 : n;
  }, 0);
}

export function countSeen(
  roster: GroupMember[],
  receipts: Record<number, MemberReceipt> | undefined,
  createdAt: string,
): number {
  if (!receipts) return 0;
  return roster.reduce((n, m) => {
    const r = receipts[m.userId];
    return r?.readUpTo != null && r.readUpTo >= createdAt ? n + 1 : n;
  }, 0);
}

interface GroupReceiptSummaryProps {
  // Group member roster excluding me — the denominator for the counts.
  roster: GroupMember[];
  // This conversation's receipt slice: { [userId]: MemberReceipt } | undefined.
  receipts: Record<number, MemberReceipt> | undefined;
  // The latest own group message's createdAt (the watermark threshold).
  createdAt: string;
  // Opens the breakdown sheet for this message (held in screen state).
  onPress: () => void;
  colors: ThemeColors;
}

export function GroupReceiptSummary({
  roster,
  receipts,
  createdAt,
  onPress,
  colors,
}: GroupReceiptSummaryProps) {
  const delivered = countDelivered(roster, receipts, createdAt);
  const seen = countSeen(roster, receipts, createdAt);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Delivered to ${delivered}, Seen by ${seen}. Tap for details.`}
      style={styles.wrap}
    >
      <Text style={[styles.text, { color: colors.textMuted }]}>
        {`Delivered to ${delivered} · Seen by ${seen}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingTop: 2,
    paddingBottom: SPACING.xs,
  },
  text: {
    fontSize: 11,
    fontFamily: FONTS.medium,
  },
});
