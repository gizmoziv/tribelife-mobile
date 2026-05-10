import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActionSheetItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetItem[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActionSheetModal({
  visible,
  onClose,
  title,
  actions,
}: ActionSheetModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleActionPress = (item: ActionSheetItem) => {
    Haptics.selectionAsync();
    item.onPress();
  };

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
        {/* Title */}
        {title ? (
          <>
            <Text style={[styles.title, { color: colors.textMuted }]}>
              {title.toUpperCase()}
            </Text>
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          </>
        ) : null}

        {/* Action rows */}
        {actions.map((item, index) => (
          <React.Fragment key={item.label}>
            {index > 0 && (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            )}
            <Pressable
              style={({ pressed }) => [
                styles.actionRow,
                pressed && styles.actionRowPressed,
              ]}
              onPress={() => handleActionPress(item)}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.actionLabel,
                  {
                    color: item.destructive ? COLORS.error : colors.text,
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          </React.Fragment>
        ))}

        {/* Cancel — visually separated */}
        <View style={{ height: SPACING.sm }} />
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
        <Pressable
          style={({ pressed }) => [
            styles.actionRow,
            pressed && styles.actionRowPressed,
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={[styles.cancelLabel, { color: colors.text }]}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.md,
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
  actionRow: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.md,
    minHeight: 52,
    justifyContent: 'center',
  },
  actionRowPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  cancelLabel: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
});
