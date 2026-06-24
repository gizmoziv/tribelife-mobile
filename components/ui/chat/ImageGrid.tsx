import React, { useState, useCallback } from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';

const GAP = 2;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

interface ImageGridProps {
  mediaUrls: string[];
  bubbleWidth: number;
  onImagePress: (index: number) => void;
  onImageLongPress?: () => void;
  borderRadius?: number;
  // When true (image+caption), only the top corners are rounded; the bottom
  // edge is squared off where it meets the caption strip below.
  flush?: boolean;
}

/** Image that silently retries with cache-busting on load failure (CDN propagation). */
function RetryImage({ uri, style, resizeMode }: { uri: string; style: any; resizeMode: 'cover' }) {
  const [attempt, setAttempt] = useState(0);

  const handleError = useCallback(() => {
    if (attempt < MAX_RETRIES) {
      setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY);
    }
  }, [attempt]);

  const source = attempt > 0
    ? { uri: `${uri}${uri.includes('?') ? '&' : '?'}_r=${attempt}` }
    : { uri };

  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      onError={handleError}
    />
  );
}

export function ImageGrid({ mediaUrls, bubbleWidth, onImagePress, onImageLongPress, borderRadius = 14, flush = false }: ImageGridProps) {
  const count = mediaUrls.length;
  if (count === 0) return null;

  // Top corners always rounded; bottom corners squared off in flush mode so the
  // grid sits flush against the caption strip.
  const tR = borderRadius;
  const bR = flush ? 0 : borderRadius;
  const containerCorners = {
    borderTopLeftRadius: tR,
    borderTopRightRadius: tR,
    borderBottomLeftRadius: bR,
    borderBottomRightRadius: bR,
  };

  if (count === 1) {
    return (
      <View style={[styles.container, containerCorners, { width: bubbleWidth }]}>
        <Pressable onPress={() => onImagePress(0)} onLongPress={onImageLongPress} delayLongPress={500}>
          <RetryImage
            uri={mediaUrls[0]}
            style={{ width: bubbleWidth, height: bubbleWidth * 0.75, ...containerCorners }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
    );
  }

  const halfWidth = (bubbleWidth - GAP) / 2;

  if (count === 2) {
    return (
      <View style={[styles.container, containerCorners, { width: bubbleWidth }]}>
        <View style={styles.row}>
          {mediaUrls.map((url, i) => (
            <Pressable key={i} onPress={() => onImagePress(i)} onLongPress={onImageLongPress} delayLongPress={500}>
              <RetryImage
                uri={url}
                style={{
                  width: halfWidth,
                  height: halfWidth,
                  borderTopLeftRadius: i === 0 ? tR : 0,
                  borderBottomLeftRadius: i === 0 ? bR : 0,
                  borderTopRightRadius: i === 1 ? tR : 0,
                  borderBottomRightRadius: i === 1 ? bR : 0,
                }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (count === 3) {
    const rowHeight = halfWidth;
    return (
      <View style={[styles.container, containerCorners, { width: bubbleWidth }]}>
        <View style={[styles.row, { marginBottom: GAP }]}>
          {mediaUrls.slice(0, 2).map((url, i) => (
            <Pressable key={i} onPress={() => onImagePress(i)} onLongPress={onImageLongPress} delayLongPress={500}>
              <RetryImage
                uri={url}
                style={{
                  width: halfWidth,
                  height: rowHeight,
                  borderTopLeftRadius: i === 0 ? tR : 0,
                  borderTopRightRadius: i === 1 ? tR : 0,
                }}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => onImagePress(2)} onLongPress={onImageLongPress} delayLongPress={500}>
          <RetryImage
            uri={mediaUrls[2]}
            style={{
              width: bubbleWidth,
              height: rowHeight,
              borderBottomLeftRadius: bR,
              borderBottomRightRadius: bR,
            }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
    );
  }

  // 4 images: 2x2 grid
  return (
    <View style={[styles.container, { borderRadius, width: bubbleWidth }]}>
      <View style={[styles.row, { marginBottom: GAP }]}>
        {mediaUrls.slice(0, 2).map((url, i) => (
          <Pressable key={i} onPress={() => onImagePress(i)} onLongPress={onImageLongPress} delayLongPress={500}>
            <RetryImage
              uri={url}
              style={{
                width: halfWidth,
                height: halfWidth,
                borderTopLeftRadius: i === 0 ? borderRadius : 0,
                borderTopRightRadius: i === 1 ? borderRadius : 0,
              }}
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        {mediaUrls.slice(2, 4).map((url, i) => (
          <Pressable key={i} onPress={() => onImagePress(i + 2)} onLongPress={onImageLongPress} delayLongPress={500}>
            <RetryImage
              uri={url}
              style={{
                width: halfWidth,
                height: halfWidth,
                borderBottomLeftRadius: i === 0 ? bR : 0,
                borderBottomRightRadius: i === 1 ? bR : 0,
              }}
              resizeMode="cover"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default ImageGrid;

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
});
