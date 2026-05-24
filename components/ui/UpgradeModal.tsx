// Phase 15 (TZRM-01): Reusable dismissible modal for capability paywall
// affordances. First consumer is the Chevra screen's timezone-room rows —
// reusable for any future paywalled discovery surface.
//
// Composition matches ConfirmModal.tsx (Phase 9) — backdrop tap-to-dismiss,
// transparent fade Modal. Visual tokens come from `@/constants` so the modal
// reads as a first-class app surface in both light + dark themes.
//
// The component does NOT couple to RevenueCat — `onUpgrade` is the caller's
// responsibility (the Chevra screen invokes the existing Purchases flow). This
// keeps the modal reusable across any future paywall surface.

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';

// ── Types ─────────────────────────────────────────────────────────────────

export interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  title?: string;
  body: string;
  upgradeLabel?: string;
  dismissLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export function UpgradeModal({
  visible,
  onClose,
  onUpgrade,
  title = 'Premium Feature',
  body,
  upgradeLabel = 'Upgrade',
  dismissLabel = 'Maybe Later',
}: UpgradeModalProps) {
  const { colors } = useTheme();

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onUpgrade();
    onClose();
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop — tap to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Card — stopPropagation so tapping the card doesn't close */}
        <Pressable
          style={[
            styles.card,
            SHADOWS.lg,
            { backgroundColor: colors.surface },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>

          {/* Primary CTA — gold gradient (premium-branded) */}
          <Pressable
            onPress={handleUpgrade}
            style={({ pressed }) => [
              styles.upgradeBtnWrap,
              pressed ? { opacity: 0.85 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={upgradeLabel}
          >
            <LinearGradient
              colors={[...COLORS.gradientPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.upgradeBtn}
            >
              <Text style={styles.upgradeBtnLabel}>{upgradeLabel}</Text>
            </LinearGradient>
          </Pressable>

          {/* Secondary CTA — dismiss */}
          <Pressable
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.dismissBtn,
              pressed ? { opacity: 0.6 } : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
          >
            <Text style={[styles.dismissBtnLabel, { color: colors.textMuted }]}>
              {dismissLabel}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default UpgradeModal;

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  upgradeBtnWrap: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  upgradeBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  upgradeBtnLabel: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    color: '#FFFFFF',
  },
  dismissBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnLabel: {
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
});
