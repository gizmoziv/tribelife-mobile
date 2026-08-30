import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';
import { formatFileSize } from '@/utils/formatFileSize';
import type { PendingAttachment } from '@/types';

interface AttachmentComposerProps {
  attachment: PendingAttachment | null;
  onCancel: () => void;
}

// Quick task 260830-kkb: dismissible preview chip for a staged (not-yet-sent)
// attachment, rendered above the input in the same slot as ReplyComposer's
// reply preview — mirrors its structure/visuals per D-07 (same surfaceElevated
// container, accent bar, dismiss control, FONTS tokens, StyleSheet block).
export function AttachmentComposer({ attachment, onCancel }: AttachmentComposerProps) {
  const { colors } = useTheme();

  if (!attachment) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceElevated }]}>
      <View style={[styles.bar, { backgroundColor: colors.primary }]} />
      <View style={styles.content}>
        {attachment.kind === 'images' && (
          <View style={styles.thumbRow}>
            {attachment.urls.map((url, i) => (
              <Image key={`${url}-${i}`} source={{ uri: url }} style={styles.thumb} contentFit="cover" />
            ))}
          </View>
        )}
        {attachment.kind === 'gif' && (
          <View style={styles.thumbRow}>
            <Image source={{ uri: attachment.url }} style={styles.thumb} contentFit="cover" />
            <Text style={[styles.label, { color: colors.primary }]}>GIF</Text>
          </View>
        )}
        {attachment.kind === 'document' && (
          <>
            <Text style={[styles.handle, { color: colors.primary }]} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={1}>
              {formatFileSize(attachment.size)}
            </Text>
          </>
        )}
      </View>
      <TouchableOpacity
        onPress={onCancel}
        hitSlop={8}
        style={styles.closeButton}
        accessibilityLabel="Remove attachment"
      >
        <Text style={[styles.closeText, { color: colors.textMuted }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default AttachmentComposer;

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
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  thumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
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
  label: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
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
