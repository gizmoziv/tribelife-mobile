import { useState, useCallback, useRef } from 'react';
import { FlatList } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Hook for scroll-to-message and brief highlight in chat FlatLists.
 */
export function useScrollToMessage<T extends { id: number }>(
  flatListRef: React.RefObject<FlatList>,
  messages: T[],
) {
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToMessage = useCallback((messageId: number) => {
    const index = messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.3,
    });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHighlightedId(messageId);

    timeoutRef.current = setTimeout(() => {
      setHighlightedId(null);
    }, 1500);
  }, [messages, flatListRef]);

  return { highlightedId, scrollToMessage };
}
