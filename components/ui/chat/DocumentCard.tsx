import React, { useCallback } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';
import { formatFileSize } from '@/utils/formatFileSize';
import type { MessageAttachment } from '@/types';

interface DocumentCardProps {
  attachment: MessageAttachment;
  isMe: boolean;
}

// Strip path separators, `..`, and control characters so the client-supplied
// original filename (attachment.name — verbatim per the Phase 30 field
// contract) can't escape FileSystem.cacheDirectory when concatenated into a
// local path (RESEARCH Security — path-injection via attachment name). Mirrors
// app/pdf-viewer.tsx's sanitizeCacheFilename (31-01) exactly.
function sanitizeCacheFilename(name: string): string {
  const stripped = name
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return stripped.length > 0 ? stripped : 'document.pdf';
}

// Simple filled-document glyph with a folded corner, matching the inline-SVG
// icon convention used elsewhere in chat (AttachmentButton, ImageViewer).
function PdfIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14 2v6h6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Document card rendered in place of the media/voice/text content region when
 * a message carries a PDF attachment (D-03, DOC-11). Tap opens the in-app
 * viewer (app/pdf-viewer.tsx, built in 31-01); long-press downloads the file
 * to local cache and hands it to the OS share sheet — the exact pattern
 * already shipping in ImageViewer.tsx's handleShare (D-05, DOC-13).
 */
export function DocumentCard({ attachment, isMe }: DocumentCardProps) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = useCallback(() => {
    router.push({
      pathname: '/pdf-viewer',
      params: { cdnUrl: attachment.url, name: attachment.name },
    });
  }, [router, attachment.url, attachment.name]);

  const handleLongPress = useCallback(async () => {
    try {
      const localUri = FileSystem.cacheDirectory + sanitizeCacheFilename(attachment.name);
      const { uri } = await FileSystem.downloadAsync(attachment.url, localUri);
      await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
    } catch {
      Alert.alert('Error', 'Could not download document.');
    }
  }, [attachment.url, attachment.name]);

  // On-gradient (isMe, primary gradient bubble) vs on-surface (received,
  // surfaceGlass bubble) contrast, mirroring the reply-preview row's approach
  // just above this content region in MessageBubble.
  const iconColor = isMe ? '#FFF' : COLORS.primary;
  const nameColor = isMe ? '#FFF' : colors.text;
  const sizeColor = isMe ? 'rgba(255,255,255,0.7)' : colors.textMuted;
  const rowBackground = isMe ? 'rgba(255,255,255,0.15)' : colors.surface;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={500}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: rowBackground, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.iconWrap}>
        <PdfIcon color={iconColor} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.name, { color: nameColor }]} numberOfLines={1}>
          {attachment.name}
        </Text>
        <Text style={[styles.size, { color: sizeColor }]} numberOfLines={1}>
          {formatFileSize(attachment.size)}
        </Text>
      </View>
    </Pressable>
  );
}

export default DocumentCard;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: SPACING.sm,
    minWidth: 200,
    maxWidth: 260,
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  size: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
});
