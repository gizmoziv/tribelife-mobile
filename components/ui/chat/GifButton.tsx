import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import {
  GiphyDialog,
  GiphyDialogEvent,
  GiphyContentType,
  GiphyRating,
  type GiphyMedia,
} from '@giphy/react-native-sdk';
import { COLORS } from '@/constants';
import { isGiphyConfigured } from '@/app/_layout';

interface GifButtonProps {
  onGifSelected: (gifUrl: string) => void;
  disabled?: boolean;
}

// Derive the stable Giphy CDN .gif URL from a selected media's id. The SDK's
// `media.url` is the GIPHY embed PAGE (not an image), so we build the canonical
// `media.giphy.com/media/<id>/giphy.gif` form. This single host:
//  - is what the backend moderation host-skip matches (media.giphy.com), and
//  - renders directly as an animated GIF via expo-image.
function giphyCdnUrl(media: GiphyMedia): string {
  return `https://media.giphy.com/media/${media.id}/giphy.gif`;
}

/**
 * GIF button for the chat composer. Mirrors AttachmentButton's sizing/hitSlop
 * so it sits naturally next to the paperclip. Opens Giphy's prebuilt picker
 * (pg-rated, search + trending) and, on selection, emits the GIF's CDN URL —
 * the selection IS the send (tap-to-send, no accompanying-text step).
 *
 * Renders nothing when Giphy is not configured (missing env key) so the app
 * never exposes a non-functional button or crashes opening the picker.
 */
export function GifButton({ onGifSelected, disabled }: GifButtonProps) {
  const onGifSelectedRef = useRef(onGifSelected);
  onGifSelectedRef.current = onGifSelected;

  useEffect(() => {
    if (!isGiphyConfigured) return;

    // pg rating per locked decision; GIF-focused content (search + trending).
    GiphyDialog.configure({
      rating: GiphyRating.PG,
      mediaTypeConfig: [GiphyContentType.Gif],
    });

    const sub = GiphyDialog.addListener(
      GiphyDialogEvent.MediaSelected,
      (e: { media: GiphyMedia }) => {
        const url = giphyCdnUrl(e.media);
        GiphyDialog.hide();
        onGifSelectedRef.current(url);
      },
    );

    return () => {
      sub.remove();
    };
  }, []);

  if (!isGiphyConfigured) return null;

  const handlePress = () => {
    if (disabled) return;
    GiphyDialog.show();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      hitSlop={8}
    >
      <Text style={styles.label}>GIF</Text>
    </TouchableOpacity>
  );
}

export default GifButton;

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
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: COLORS.primary,
  },
});
