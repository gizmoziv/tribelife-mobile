import React from 'react';
import { View, Text, Pressable, Share, Platform, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS } from '@/constants';

interface InviteTokenBoxProps {
  url: string;
  shareMessage?: string;
  onCopy?: () => void;
  onShare?: () => void;
}

export function InviteTokenBox({ url, shareMessage, onCopy, onShare }: InviteTokenBoxProps) {
  const { colors } = useTheme();

  const handleCopy = async () => {
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCopy?.();
  };

  const handleShare = async () => {
    const message = shareMessage ?? url;
    try {
      if (Platform.OS === 'ios') {
        await Share.share({ message, url });
      } else {
        await Share.share({ message: `${message}\n${url}` });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onShare?.();
    } catch {
      // user cancelled — silent
    }
  };

  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
      <Text
        style={[styles.url, { color: colors.text }]}
        numberOfLines={1}
        ellipsizeMode="middle"
        accessibilityLabel={`Invite link: ${url}`}
      >
        {url}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={handleCopy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Copy invite link"
        >
          <Text style={[styles.glyph, { color: colors.text }]}>📋</Text>
        </Pressable>
        <Pressable
          onPress={handleShare}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Share invite link"
        >
          <Text style={[styles.glyph, { color: colors.text }]}>↗</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default InviteTokenBox;

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  url: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  actions: { flexDirection: 'row', gap: SPACING.md },
  glyph: { fontSize: 18 },
});
