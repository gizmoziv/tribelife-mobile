import React from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS } from '@/constants';
import {
  IOS_STORE_URL,
  ANDROID_STORE_URL,
  ANDROID_STORE_URL_FALLBACK,
} from '@/constants/storeUrls';

interface ForceUpdateModalProps {
  message?: string;
}

/**
 * Phase 6 force-update gate UI (FORCE-03 / D-08).
 *
 * Non-dismissible full-screen Modal:
 *   - animationType="fade"
 *   - transparent={false} (the modal IS the full screen)
 *   - hardwareAccelerated={true}
 *   - onRequestClose={() => {}  (Android hardware back button → no-op)
 *
 * "Update Now" deep-links to App Store / Play Store via Linking.openURL.
 * Per D-07, Android uses canOpenURL to pick between market:// and the
 * https:// Play Store URL (locked decision: graceful behavior on devices
 * without the Play Store app installed).
 */
export function ForceUpdateModal({ message }: ForceUpdateModalProps): React.ReactElement {
  const { colors } = useTheme();

  const handleUpdate = async (): Promise<void> => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL(IOS_STORE_URL);
        return;
      }
      const canOpenMarket = await Linking.canOpenURL(ANDROID_STORE_URL).catch(() => false);
      const target = canOpenMarket ? ANDROID_STORE_URL : ANDROID_STORE_URL_FALLBACK;
      await Linking.openURL(target);
    } catch (err) {
      console.warn('[ForceUpdateModal] openURL failed', err);
      // Surface to user — on a non-dismissible modal with one action button,
      // a silently-broken tap is a hard lock. Give the user a manual fallback.
      Alert.alert(
        "Couldn't open the store",
        'Please search for "TribeLife" in the App Store or Play Store to update.',
        [{ text: 'OK' }],
      );
    }
  };

  const bodyCopy = message?.trim() || 'You\'re using an older version of TribeLife. Please update to continue.';

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={false}
      hardwareAccelerated={true}
      onRequestClose={() => { /* D-08 — Android hardware back is a no-op */ }}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Text style={[styles.brand, { color: colors.primary }]}>TribeLife</Text>
          <Text style={[styles.title, { color: colors.text }]}>Update Required</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{bodyCopy}</Text>

          <TouchableOpacity
            onPress={handleUpdate}
            style={[styles.button, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Update Now"
          >
            <Text style={[styles.buttonText, { color: colors.background }]}>Update Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  brand: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    marginBottom: SPACING.xl,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.lg,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
  },
});

export default ForceUpdateModal;
