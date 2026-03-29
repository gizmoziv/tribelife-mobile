import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Alert,
} from 'react-native';
import EmojiKeyboard from 'rn-emoji-keyboard';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, RADIUS, SHADOWS } from '@/constants';

const QUICK_EMOJIS = [
  '\u{1F44D}', // thumbsup
  '\u{2764}\u{FE0F}', // heart
  '\u{1F525}', // fire
  '\u{1F64F}', // pray
  '\u{1F602}', // joy
  '\u{1F44F}', // clap
];

interface ContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onReport: () => void;
  messageContent: string;
}

export function ContextMenu({
  visible,
  onClose,
  onReact,
  onReply,
  onReport,
  messageContent,
}: ContextMenuProps) {
  const { colors } = useTheme();
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [pendingFullPicker, setPendingFullPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
    }
  }, [visible]);

  // Open emoji picker after context menu finishes dismissing
  useEffect(() => {
    if (pendingFullPicker && !visible) {
      const timer = setTimeout(() => {
        setShowFullPicker(true);
        setPendingFullPicker(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pendingFullPicker, visible]);

  const handleQuickReact = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  const handleFullPickerSelect = (emojiObject: { emoji: string }) => {
    onReact(emojiObject.emoji);
    setShowFullPicker(false);
  };

  const handleReply = () => {
    onReply();
    onClose();
  };

  const handleTranslate = () => {
    Alert.alert('Coming Soon', 'Translation will be available in a future update.');
  };

  const handleReport = () => {
    onReport();
    onClose();
  };

  return (
    <>
      <Modal
        transparent
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}
            onPress={() => {}}
          >
            {/* Quick emoji bar */}
            <View style={styles.emojiBar}>
              {QUICK_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => handleQuickReact(emoji)}
                  style={[styles.emojiButton, { backgroundColor: colors.surface }]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => { setPendingFullPicker(true); onClose(); }}
                style={[styles.emojiButton, { backgroundColor: colors.surface }]}
                activeOpacity={0.7}
              >
                <Text style={styles.emojiText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Action items */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleReply}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>&#x21A9;</Text>
              <Text style={[styles.actionLabel, { color: colors.text }]}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleTranslate}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionIcon, { opacity: 0.4 }]}>&#x1F310;</Text>
              <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
                Translate
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleReport}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>&#x26A0;</Text>
              <Text style={[styles.actionLabel, { color: colors.error }]}>Report</Text>
            </TouchableOpacity>

            {/* Bottom safe area padding */}
            <View style={{ height: 20 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <EmojiKeyboard
        onEmojiSelected={handleFullPickerSelect}
        open={showFullPicker}
        onClose={() => setShowFullPicker(false)}
      />
    </>
  );
}

export default ContextMenu;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingTop: 16,
    paddingHorizontal: 16,
    ...SHADOWS.lg,
  },
  emojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 22,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 12,
  },
  actionIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  actionLabel: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
});
