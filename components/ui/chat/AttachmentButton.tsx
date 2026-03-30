import React from 'react';
import { TouchableOpacity, Alert, StyleSheet, ActionSheetIOS, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { COLORS } from '@/constants';
import Svg, { Path } from 'react-native-svg';

interface AttachmentButtonProps {
  onImagesSelected: (uris: string[]) => void;
  disabled?: boolean;
}

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
      const resize = asset.width > asset.height
        ? { width: 1200 }
        : { height: 1200 };
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

export function AttachmentButton({ onImagesSelected, disabled }: AttachmentButtonProps) {
  const handlePress = () => {
    if (disabled) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) takePhoto(onImagesSelected);
          if (buttonIndex === 2) pickFromLibrary(onImagesSelected);
        },
      );
    } else {
      Alert.alert('Add Image', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => takePhoto(onImagesSelected) },
        { text: 'Choose from Library', onPress: () => pickFromLibrary(onImagesSelected) },
      ]);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      hitSlop={8}
    >
      <PaperclipIcon />
    </TouchableOpacity>
  );
}

export default AttachmentButton;

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
