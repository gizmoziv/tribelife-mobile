import { useEffect, useRef, useState } from 'react';
import { Animated, type ViewToken } from 'react-native';
import { formatChatDateLabel } from '@/services/chatDateSeparators';

// ── Floating sticky chat-date header driver ──────────────────────────────────
// Drives the transient "sticky" date pill (Viber/Telegram behavior): as the
// user scrolls, it reflects the calendar day of the topmost visible message and
// fades out shortly after scrolling stops.
//
// Attach `onViewableItemsChanged` + `viewabilityConfig` to a FlatList and render
// an Animated.View overlay using the returned `opacity` + `label`. Both handler
// and config are STABLE across renders — React Native forbids changing them on
// the fly. The overlay must live OUTSIDE the FlatList's inverted transform (a
// sibling overlay in the screen), otherwise it would be mirrored.

const HIDE_DELAY_MS = 1500;
const FADE_IN_MS = 150;
const FADE_OUT_MS = 400;

export function useStickyChatDate() {
  const [label, setLabel] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRef = useRef(false);
  // WR-01: onViewableItemsChanged fires once on initial layout. Track the first
  // fire so we seed the label WITHOUT flashing the pill in on mount (spec: the
  // pill appears on scroll, not on chat open).
  const firstFireRef = useRef(true);

  // Reveal the pill (if hidden) and (re)arm the fade-out timer. Stable: closes
  // over refs + the stable Animated.Value only.
  const show = useRef(() => {
    if (!shownRef.current) {
      shownRef.current = true;
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    }
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      shownRef.current = false;
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start();
    }, HIDE_DELAY_MS);
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems || viewableItems.length === 0) return;
      // Inverted list: index 0 is the visual bottom (newest), so the TOPMOST
      // visible row is the viewable item with the HIGHEST index.
      let top: ViewToken | null = null;
      for (const vt of viewableItems) {
        if (vt.index == null) continue;
        if (top === null || vt.index > (top.index ?? -1)) top = vt;
      }
      const createdAt = (top?.item as { createdAt?: string } | undefined)?.createdAt;
      if (!createdAt) return;
      const next = formatChatDateLabel(createdAt);
      if (!next) return;
      setLabel((prev) => (prev === next ? prev : next));
      // Seed the label on the initial (mount) fire but don't reveal the pill —
      // only scroll-driven invocations fade it in.
      if (firstFireRef.current) {
        firstFireRef.current = false;
        return;
      }
      show();
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 0,
  }).current;

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  return { label, opacity, onViewableItemsChanged, viewabilityConfig };
}
