import React from 'react';
import { TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '@/constants';
import Svg, { Path } from 'react-native-svg';

interface DocumentButtonProps {
  onDocumentPicked: (doc: { uri: string; name: string; size: number }) => void;
  disabled?: boolean;
}

const DOC_MAX_BYTES = 25 * 1024 * 1024;

function DocumentIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke={COLORS.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 2v6h6"
        stroke={COLORS.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
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

/**
 * Document (PDF) button for the chat composer. Mirrors GifButton's
 * sizing/hitSlop/disabled styling — a separate button per attach-source,
 * matching the existing AttachmentButton (photos) / GifButton precedent
 * rather than growing the photo action sheet with an unrelated file type.
 *
 * Picks a single application/pdf via expo-document-picker, enforces the
 * 25 MB cap BEFORE handing off to the composer (fail-fast UX only — the
 * server confirm remains the authoritative gate). The button owns pick +
 * cap only; the composer owns upload + send.
 */
export function DocumentButton({ onDocumentPicked, disabled }: DocumentButtonProps) {
  const handlePress = () => {
    if (disabled) return;
    pickDocument(onDocumentPicked);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      hitSlop={8}
    >
      <DocumentIcon />
    </TouchableOpacity>
  );
}

export default DocumentButton;

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
