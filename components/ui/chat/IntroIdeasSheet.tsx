import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { PillButton } from '@/components/ui/PillButton';
import { FONTS, SPACING, RADIUS } from '@/constants';
import { INTRO_IDEAS } from '@/constants/intro';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntroIdeasSheetProps {
  visible: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

// Phase 44 D-09: read-only ideas for the intro. Plain text, deliberately not
// tap-to-fill; the shell is copied from ConfirmModal.
export function IntroIdeasSheet({ visible, onClose }: IntroIdeasSheetProps) {
  const { colors } = useTheme();

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
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.borderGlow }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>Ideas for your intro</Text>
          <Text style={[styles.lead, { color: colors.textMuted }]}>
            A few things people like to share:
          </Text>
          <View style={styles.list}>
            {INTRO_IDEAS.map((idea) => (
              <View key={idea} style={styles.row}>
                <Text style={[styles.bullet, { color: colors.textMuted }]}>{'•'}</Text>
                <Text style={[styles.idea, { color: colors.text }]}>{idea}</Text>
              </View>
            ))}
          </View>
          <PillButton title="Got it" onPress={onClose} />
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
    maxWidth: 340,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
  },
  lead: {
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  list: {
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bullet: {
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  idea: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
});

export default IntroIdeasSheet;
