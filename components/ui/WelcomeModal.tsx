import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { PillButton } from '@/components/ui/PillButton';

// One-time welcome shown over the beacon screen right after account creation.
// Pure presentational — the caller owns visibility and the "seen" persistence.
const BULLETS = [
  'The whole chat history is here, even if you show up late',
  'Auto-translation, Hebrew included, come as you are',
  'Local + global rooms by default, no caps ever',
  'Your own DMs and group chats, no gatekeepers',
  'A beacon hunts for valuable matches every night, free. Want more? Premium',
];

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WelcomeModal({ visible, onClose }: WelcomeModalProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dimmed scrim — the beacon page shows through behind it. Intentionally
          not tap-to-dismiss: dismissal is the explicit X or the CTA button. */}
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.background,
              borderColor: COLORS.borderGlow,
            },
          ]}
        >
          {/* Close — top-left per request */}
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: colors.surface }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M6 6l12 12M18 6L6 18"
                stroke={colors.text}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </TouchableOpacity>

          <Text style={[styles.header, { color: colors.text }]}>
            Why is this app different from all others?
          </Text>

          <ScrollView
            style={styles.bulletScroll}
            contentContainerStyle={styles.bulletContent}
            showsVerticalScrollIndicator={false}
          >
            {BULLETS.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>🔥</Text>
                <Text style={[styles.bulletText, { color: colors.textMuted }]}>
                  {b}
                </Text>
              </View>
            ))}
          </ScrollView>

          <PillButton
            title="Yalla, let's go 🤙"
            onPress={onClose}
            variant="accent"
            size="lg"
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </Modal>
  );
}

export default WelcomeModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingTop: 56,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  header: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  bulletScroll: { alignSelf: 'stretch', marginBottom: SPACING.lg },
  bulletContent: { gap: SPACING.md },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bulletMark: { fontSize: 16, marginTop: 1 },
  bulletText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 22,
  },
});
