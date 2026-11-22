import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPasteButton } from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, SPACING, RADIUS } from '@/constants';
import { useClipboardImage } from '@/hooks/useClipboardImage';
import { compressImages } from '@/components/ui/chat/AttachmentMenuButton';

// Phase 46 (PASTE-01..05): "Paste image" chip shown above the composer while the
// input is focused and the clipboard holds an image. Detection is prompt-free
// (useClipboardImage); the clipboard image is read ONLY on an explicit tap.
// iOS with the system paste control (isPasteButtonAvailable) renders Apple's
// ClipboardPasteButton, whose onPress hands us the image with NO "Allow Paste"
// prompt (getImageAsync would prompt on every tap). Android / iOS without the
// control keep the custom chip + getImageAsync. Both paths stage the image via
// stageImageFromDataUri -> the same onImagesSelected contract as the paper clip.

interface PasteImageChipProps {
  active: boolean;
  disabled?: boolean;
  onImagesSelected: (uris: string[]) => void;
}

function ClipboardImageIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={3} stroke={color} strokeWidth={2} />
      <Path
        d="M3 16l5-5 4 4 3-3 6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Shared staging: data URI -> cache file -> compressImages -> haptic -> onImagesSelected.
// Module-level named function so its compiled Hermes form is locatable by `Original name`
// in the Android bytecode gate. Plain if-blocks only — no Platform ternary + destructure
// (miscompile class, 261121-hx0).
async function stageImageFromDataUri(
  dataUri: string,
  size: { width: number; height: number },
  onImagesSelected: (uris: string[]) => void,
): Promise<void> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('no cache directory');
  }
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const isPng = dataUri.startsWith('data:image/png');
  const path = FileSystem.cacheDirectory + `paste-${Date.now()}.${isPng ? 'png' : 'jpg'}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  const uris = await compressImages([{ uri: path, width: size.width, height: size.height }]);
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* best-effort temp cleanup */
  }
  try {
    Haptics.selectionAsync();
  } catch {
    /* haptics are best-effort */
  }
  onImagesSelected(uris);
}

// Non-paste-control path (Android, iOS without UIPasteControl): reads the clipboard image.
async function pasteClipboardImage(onImagesSelected: (uris: string[]) => void): Promise<void> {
  const img = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.9 });
  if (!img) {
    Alert.alert(
      "Couldn't paste image",
      "TribeLife couldn't read the image on your clipboard. Check that pasting is allowed in Settings, or use the paper clip.",
    );
    return;
  }
  await stageImageFromDataUri(img.data, img.size, onImagesSelected);
}

// Apple's system paste control only exists on iOS 16+. Plain boolean const (no ternary+destructure).
const USE_SYSTEM_PASTE_BUTTON = Platform.OS === 'ios' && Clipboard.isPasteButtonAvailable;

export function PasteImageChip({ active, disabled, onImagesSelected }: PasteImageChipProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const { hasImage, refresh } = useClipboardImage(active && !disabled);

  if (!active || disabled || !hasImage) return null;

  // iOS system paste control: tapping it grants one-shot paste access, so the image arrives
  // in the event and no "Allow Paste" prompt appears. Non-image / empty events are ignored.
  const handleSystemPaste = async (event: Clipboard.PasteEventPayload) => {
    if (busy) return;
    if (event.type !== 'image') return;
    if (!event.data || !event.size || event.size.width <= 0 || event.size.height <= 0) return;
    setBusy(true);
    try {
      await stageImageFromDataUri(event.data, event.size, onImagesSelected);
    } catch (err) {
      console.error('[paste-image]', err);
      Alert.alert("Couldn't paste image", 'Please try again or use the paper clip.');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (USE_SYSTEM_PASTE_BUTTON) {
    return (
      // Apple's button alone — a "Paste image" label beside it read as a second button.
      <View style={styles.systemRow}>
        <ClipboardPasteButton
          acceptedContentTypes={['image']}
          displayMode="iconAndLabel"
          imageOptions={{ format: 'jpeg', jpegQuality: 0.9 }}
          style={styles.systemButton}
          onPress={handleSystemPaste}
        />
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
    );
  }

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await pasteClipboardImage(onImagesSelected);
    } catch (err) {
      console.error('[paste-image]', err);
      Alert.alert("Couldn't paste image", 'Please try again or use the paper clip.');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={busy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Paste image from clipboard"
      style={[styles.chip, { backgroundColor: colors.surfaceElevated }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <ClipboardImageIcon color={colors.primary} />
      )}
      <Text style={[styles.label, { color: colors.primary }]}>Paste image</Text>
    </TouchableOpacity>
  );
}

export default PasteImageChip;

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm - 2,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md - 4,
    paddingVertical: SPACING.sm - 2,
    borderRadius: RADIUS.pill,
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingRight: SPACING.md - 4,
    borderRadius: RADIUS.pill,
  },
  systemButton: {
    width: 100,
    height: 36,
  },
  label: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
});
