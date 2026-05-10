import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfirmModal({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
}: ConfirmModalProps) {
  const { colors } = useTheme();

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onClose();
    onConfirm();
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
            { backgroundColor: colors.background },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {/* Message (optional) */}
          {message ? (
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {message}
            </Text>
          ) : null}

          {/* Button row */}
          <View style={[styles.buttonRow, { borderTopColor: colors.border }]}>
            {/* Cancel */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.buttonLeft,
                { borderRightColor: colors.border },
                pressed && styles.buttonPressed,
              ]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelLabel, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>

            {/* Confirm */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text
                style={[
                  styles.confirmLabel,
                  { color: destructive ? COLORS.error : COLORS.primary },
                ]}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    maxWidth: 320,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  message: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonLeft: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  cancelLabel: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  confirmLabel: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
});
