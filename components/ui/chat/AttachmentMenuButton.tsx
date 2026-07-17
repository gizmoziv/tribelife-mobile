import React, { useState } from 'react';
import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '@/constants';
import { ActionSheetModal, ActionSheetItem } from '@/components/ui/ActionSheetModal';

// Viber-style single "+" attach entry point: one paperclip that opens a themed
// chooser (Take Photo / Photo Library / Document) instead of separate buttons
// per source. Consolidates the former AttachmentButton (photos) + DocumentButton
// (PDF) so the composer keeps more room for the text field. GIF stays its own
// button (operator decision 2026-07-16) — it is NOT surfaced here.

interface AttachmentMenuButtonProps {
  onImagesSelected?: (uris: string[]) => void;
  onDocumentPicked?: (doc: { uri: string; name: string; size: number }) => void;
  disabled?: boolean;
}

const DOC_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — client-side fail-fast (server confirm is authoritative)

function PaperclipIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
        stroke={COLORS.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

async function compressImages(assets: ImagePicker.ImagePickerAsset[]): Promise<string[]> {
  const compressed = await Promise.all(
    assets.map(async (asset) => {
      const longestSide = Math.max(asset.width, asset.height);
      const resize = asset.width > asset.height ? { width: 1200 } : { height: 1200 };
      const actions = longestSide > 1200 ? [{ resize }] : [];
      const result = await manipulateAsync(asset.uri, actions, {
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      return result.uri;
    }),
  );
  return compressed;
}

async function pickFromLibrary(onImagesSelected: (uris: string[]) => void) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Needed', 'Please allow access to your photo library in Settings.');
    return;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 4,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return;

  const compressed = await compressImages(result.assets);
  onImagesSelected(compressed);
}

async function takePhoto(onImagesSelected: (uris: string[]) => void) {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Needed', 'Please allow camera access in Settings.');
    return;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return;

  const compressed = await compressImages(result.assets);
  onImagesSelected(compressed);
}

async function pickDocument(onDocumentPicked: (doc: { uri: string; name: string; size: number }) => void) {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) return;

  const asset = result.assets[0];
  if ((asset.size ?? 0) > DOC_MAX_BYTES) {
    Alert.alert('File Too Large', 'PDFs must be under 25 MB. Please choose a smaller file.');
    return;
  }

  onDocumentPicked({ uri: asset.uri, name: asset.name, size: asset.size ?? 0 });
}

export function AttachmentMenuButton({
  onImagesSelected,
  onDocumentPicked,
  disabled,
}: AttachmentMenuButtonProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  // Close the sheet FIRST, then present the native picker after the dismiss
  // animation — avoids the iOS "presenting X while Y is being dismissed" race.
  const runAfterClose = (fn: () => void) => {
    setMenuVisible(false);
    setTimeout(fn, 220);
  };

  const actions: ActionSheetItem[] = [];
  if (onImagesSelected) {
    actions.push({ label: 'Take Photo', onPress: () => runAfterClose(() => takePhoto(onImagesSelected)) });
    actions.push({ label: 'Photo Library', onPress: () => runAfterClose(() => pickFromLibrary(onImagesSelected)) });
  }
  if (onDocumentPicked) {
    actions.push({ label: 'Document', onPress: () => runAfterClose(() => pickDocument(onDocumentPicked)) });
  }

  if (actions.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => !disabled && setMenuVisible(true)}
        disabled={disabled}
        style={[styles.button, disabled && styles.disabled]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
      >
        <PaperclipIcon />
      </TouchableOpacity>

      <ActionSheetModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title="Attach"
        actions={actions}
      />
    </>
  );
}

export default AttachmentMenuButton;

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
