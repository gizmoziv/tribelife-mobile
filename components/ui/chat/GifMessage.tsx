import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

interface GifMessageProps {
  url: string;
  bubbleWidth: number;
  borderRadius?: number;
  // When true (image+caption), only the top corners are rounded; the bottom is
  // squared off where it meets the caption strip.
  flush?: boolean;
}

// Cap how tall a portrait GIF can grow so an extreme aspect ratio doesn't fill
// the screen. Width is always constrained to the bubble width.
const MAX_HEIGHT = 320;

/**
 * Renders a SINGLE GIF at its native aspect ratio using expo-image, which
 * animates GIFs on BOTH iOS and Android (RN core <Image> does not animate on
 * Android — that's why this is a dedicated path, separate from the photo
 * ImageGrid). Width is constrained to `bubbleWidth`; height follows the GIF's
 * intrinsic aspect (capped). NOT the 2x2 grid used for photos.
 */
export function GifMessage({ url, bubbleWidth, borderRadius = 14, flush = false }: GifMessageProps) {
  // Default to a square until the real aspect ratio loads, then follow it.
  const [aspectRatio, setAspectRatio] = useState(1);

  const height = Math.min(bubbleWidth / aspectRatio, MAX_HEIGHT);
  const bottomRadius = flush ? 0 : borderRadius;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: bubbleWidth,
          height,
          borderTopLeftRadius: borderRadius,
          borderTopRightRadius: borderRadius,
          borderBottomLeftRadius: bottomRadius,
          borderBottomRightRadius: bottomRadius,
        },
      ]}
    >
      <Image
        source={url}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        autoplay
        onLoad={(e) => {
          const { width, height: h } = e.source;
          if (width > 0 && h > 0) setAspectRatio(width / h);
        }}
      />
    </View>
  );
}

export default GifMessage;

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
