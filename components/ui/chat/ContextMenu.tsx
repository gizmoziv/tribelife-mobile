import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import EmojiKeyboard from 'rn-emoji-keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// ── Monochrome action icons (Feather/Lucide stroke paths) ───────────────────
// Emoji glyphs are multicolor and can't be tinted; these single-color stroke
// icons take a `color` prop so every row's icon unifies to the theme text color
// (light/dark aware), with Delete the lone red exception — matching Viber.
const ICON_SIZE = 20;
const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}
const CopyIcon = ({ color }: { color: string }) => (
  <Icon>
    <Rect x={9} y={9} width={13} height={13} rx={2} {...stroke(color)} />
    <Path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" {...stroke(color)} />
  </Icon>
);
const ReplyIcon = ({ color }: { color: string }) => (
  <Icon>
    <Polyline points="9 14 4 9 9 4" {...stroke(color)} />
    <Path d="M20 20v-7a4 4 0 00-4-4H4" {...stroke(color)} />
  </Icon>
);
const PinIcon = ({ color }: { color: string }) => (
  <Icon>
    <Path d="M12 17v5" {...stroke(color)} />
    <Path
      d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0116 10.76V7a1 1 0 011-1 2 2 0 000-4H7a2 2 0 000 4 1 1 0 011 1z"
      {...stroke(color)}
    />
  </Icon>
);
const EditIcon = ({ color }: { color: string }) => (
  <Icon>
    <Path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" {...stroke(color)} />
  </Icon>
);
const InfoIcon = ({ color }: { color: string }) => (
  <Icon>
    <Circle cx={12} cy={12} r={10} {...stroke(color)} />
    <Line x1={12} y1={16} x2={12} y2={12} {...stroke(color)} />
    <Line x1={12} y1={8} x2={12.01} y2={8} {...stroke(color)} />
  </Icon>
);
const TranslateIcon = ({ color }: { color: string }) => (
  <Icon>
    <Circle cx={12} cy={12} r={10} {...stroke(color)} />
    <Line x1={2} y1={12} x2={22} y2={12} {...stroke(color)} />
    <Path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" {...stroke(color)} />
  </Icon>
);
const ReportIcon = ({ color }: { color: string }) => (
  <Icon>
    <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" {...stroke(color)} />
    <Line x1={12} y1={9} x2={12} y2={13} {...stroke(color)} />
    <Line x1={12} y1={17} x2={12.01} y2={17} {...stroke(color)} />
  </Icon>
);
const DeleteIcon = ({ color }: { color: string }) => (
  <Icon>
    <Polyline points="3 6 5 6 21 6" {...stroke(color)} />
    <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" {...stroke(color)} />
    <Line x1={10} y1={11} x2={10} y2={17} {...stroke(color)} />
    <Line x1={14} y1={11} x2={14} y2={17} {...stroke(color)} />
  </Icon>
);

interface ContextMenuProps {
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onCopy?: () => void;       // optional — omitted when there's no text content to copy
  onReply?: () => void;      // optional — news feed omits Reply row (news has no reply concept)
  onEdit?: () => void;       // optional — only shown when isOwn === true
  onDelete?: () => void;     // optional — delete-for-everyone; only shown when isOwn === true
  isOwn?: boolean;           // default false — controls Edit/Delete row visibility
  onReport?: () => void;     // optional — news feed omits Report row (Phase 3 has no article moderation; future phase extends content_type enum to include 'news' and re-enables)
  onTranslate?: () => void;  // optional — news feed omits Translate row (D-05 tile-level toggle)
  onInfo?: () => void;       // optional — own group messages: opens the read-receipt breakdown
  // When set, the Translate row renders DISABLED with this hint appended
  // (e.g. '(no transcript)' for a voice message that has no transcript to translate).
  translateDisabledHint?: string | null;
  // Phase 22: pin/unpin — pass undefined (NEVER a no-op arrow) for non-empowered users
  // so the row is completely absent from the menu for users who can't pin.
  onPin?: () => void;        // optional — shown only when caller passes a defined handler
  onUnpin?: () => void;      // optional — shown only when the message is the current pin AND caller is empowered
  messageContent: string;
}

export function ContextMenu({
  visible,
  onClose,
  onReact,
  onCopy,
  onReply,
  onEdit,
  onDelete,
  isOwn = false,
  onReport,
  onTranslate,
  onInfo,
  translateDisabledHint,
  onPin,
  onUnpin,
  messageContent,
}: ContextMenuProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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

  const handleCopy = () => {
    onCopy?.();
    onClose();
  };

  const handleReply = () => {
    onReply?.();
    onClose();
  };

  const handleEdit = () => {
    onEdit?.();
    onClose();
  };

  const handleDelete = () => {
    onDelete?.();
    onClose();
  };

  const handleTranslate = () => {
    onTranslate?.();
    onClose();
  };

  const handlePin = () => {
    onPin?.();
    onClose();
  };

  const handleUnpin = () => {
    onUnpin?.();
    onClose();
  };

  const handleReport = () => {
    onReport?.();
    onClose();
  };

  const handleInfo = () => {
    onInfo?.();
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
            style={[styles.sheet, { backgroundColor: colors.background }]}
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

            {/* Action items — rows hidden when their prop is undefined (e.g. news tiles omit all three).
                Icons unify to colors.text; Delete is the destructive exception (red icon + red label)
                and sits LAST (below Report), Viber-style. */}
            {onCopy && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleCopy}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><CopyIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Copy text</Text>
              </TouchableOpacity>
            )}

            {onReply && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleReply}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><ReplyIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Reply</Text>
              </TouchableOpacity>
            )}

            {onPin && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handlePin}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><PinIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Pin</Text>
              </TouchableOpacity>
            )}

            {onUnpin && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleUnpin}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><PinIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Unpin</Text>
              </TouchableOpacity>
            )}

            {onEdit && isOwn && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleEdit}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><EditIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
            )}

            {onInfo && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleInfo}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><InfoIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Info</Text>
              </TouchableOpacity>
            )}

            {onTranslate && (
              translateDisabledHint ? (
                <View style={[styles.actionRow, { opacity: 0.45 }]}>
                  <View style={styles.iconSlot}><TranslateIcon color={colors.textMuted} /></View>
                  <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
                    {`Translate ${translateDisabledHint}`}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={handleTranslate}
                  activeOpacity={0.7}
                >
                  <View style={styles.iconSlot}><TranslateIcon color={colors.text} /></View>
                  <Text style={[styles.actionLabel, { color: colors.text }]}>
                    Translate
                  </Text>
                </TouchableOpacity>
              )
            )}

            {onReport && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleReport}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><ReportIcon color={colors.text} /></View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Report</Text>
              </TouchableOpacity>
            )}

            {onDelete && isOwn && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleDelete}
                activeOpacity={0.7}
              >
                <View style={styles.iconSlot}><DeleteIcon color={colors.error} /></View>
                <Text style={[styles.actionLabel, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            )}

            {/* Bottom safe area padding */}
            <View style={{ height: insets.bottom + 20 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <EmojiKeyboard
        onEmojiSelected={handleFullPickerSelect}
        open={showFullPicker}
        onClose={() => setShowFullPicker(false)}
        enableSearchBar
        enableRecentlyUsed
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
  iconSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
});
