import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';

interface ReplyComposerProps {
  replyTo: { senderHandle: string; content: string } | null;
  onCancel: () => void;
}

export function ReplyComposer({ replyTo, onCancel }: ReplyComposerProps) {
  const { colors } = useTheme();

  if (!replyTo) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceElevated }]}>
      <View style={[styles.bar, { backgroundColor: colors.primary }]} />
      <View style={styles.content}>
        <Text style={[styles.handle, { color: colors.primary }]}>
          @{replyTo.senderHandle}
        </Text>
        <Text
          style={[styles.preview, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {replyTo.content}
        </Text>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={8} style={styles.closeButton}>
        <Text style={[styles.closeText, { color: colors.textMuted }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default ReplyComposer;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  bar: {
    width: 4,
    height: '100%',
    minHeight: 32,
    borderRadius: 2,
    marginRight: 8,
  },
  content: {
    flex: 1,
  },
  handle: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
  },
  preview: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 1,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  closeText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
});
