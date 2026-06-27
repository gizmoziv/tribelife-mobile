import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import type { GroupMember, MemberReceipt } from '@/types';

// ── Phase 29: ReceiptBreakdownSheet (D-03, RCPT-05) ─────────────────────────
// Per-member read-receipt breakdown for one group message. Opened by tapping
// the GroupReceiptSummary line (the indicator, not the bubble — D-03).
//
// ActionSheetModal only renders { label, onPress } rows (ActionSheetModal.tsx
// :16-27), so this is a SIBLING sheet: it copies that file's Modal + backdrop +
// useSafeAreaInsets + slide chrome (:45-122) and swaps the action rows for
// member rows — AvatarCircle + @handle + a per-member state label.
//
// Per-member state (vs. the message's createdAt watermark threshold):
//   readUpTo      >= createdAt → "Seen" (+ relative time)
//   deliveredUpTo >= createdAt → "Delivered"
//   otherwise                  → "Not delivered yet"
// ISO strings compare lexicographically (UTC toISOString), matching the
// aggregate + deriveTick. Pre-Phase-28-deploy the store is empty → every row
// reads "Not delivered yet" (constraint 5 — designed, not a crash).

type MemberState =
  | { label: 'Seen'; at: string }
  | { label: 'Delivered' }
  | { label: 'Not delivered yet' };

function memberState(
  receipt: MemberReceipt | undefined,
  createdAt: string,
): MemberState {
  if (receipt?.readUpTo != null && receipt.readUpTo >= createdAt) {
    return { label: 'Seen', at: receipt.readUpTo };
  }
  if (receipt?.deliveredUpTo != null && receipt.deliveredUpTo >= createdAt) {
    return { label: 'Delivered' };
  }
  return { label: 'Not delivered yet' };
}

interface ReceiptBreakdownSheetProps {
  visible: boolean;
  onClose: () => void;
  // Group member roster excluding me.
  roster: GroupMember[];
  // This conversation's receipt slice.
  receipts: Record<number, MemberReceipt> | undefined;
  // The target message's createdAt (the watermark threshold). null when closed.
  createdAt: string | null;
}

export function ReceiptBreakdownSheet({
  visible,
  onClose,
  roster,
  receipts,
  createdAt,
}: ReceiptBreakdownSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + SPACING.sm,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.textMuted }]}>
          MESSAGE INFO
        </Text>
        <View style={[styles.separator, { backgroundColor: colors.border }]} />

        <ScrollView style={styles.scroll} bounces={false}>
          {roster.map((m, index) => {
            const state = createdAt
              ? memberState(receipts?.[m.userId], createdAt)
              : ({ label: 'Not delivered yet' } as MemberState);
            const isSeen = state.label === 'Seen';
            const stateText =
              state.label === 'Seen'
                ? `Seen · ${formatRelativeTime(state.at)}`
                : state.label; // "Delivered" | "Not delivered yet"
            return (
              <React.Fragment key={m.userId}>
                {index > 0 && (
                  <View
                    style={[styles.separator, { backgroundColor: colors.border }]}
                  />
                )}
                <View style={styles.row}>
                  <AvatarCircle
                    name={m.name || m.handle}
                    size={36}
                    imageUrl={m.avatarUrl ?? undefined}
                  />
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.handle, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {`@${m.handle}`}
                    </Text>
                    <Text
                      style={[
                        styles.state,
                        { color: isSeen ? COLORS.primary : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {stateText}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.md,
    maxHeight: '70%',
  },
  title: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.8,
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SPACING.page,
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm + 2,
  },
  rowText: {
    flex: 1,
  },
  handle: {
    fontSize: 15,
    fontFamily: FONTS.medium,
  },
  state: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 1,
  },
});
