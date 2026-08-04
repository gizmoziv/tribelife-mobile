import { useCallback, useState, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const SCROLL_TO_BOTTOM_THRESHOLD = 100;

// Message lists render `inverted`, so contentOffset.y === 0 is the newest
// message (the visual bottom) — "at bottom" means still within threshold of it.
export function useScrollToBottom(listRef: RefObject<FlatList<any> | null>) {
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIsAtBottom(e.nativeEvent.contentOffset.y < SCROLL_TO_BOTTOM_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setIsAtBottom(true);
  }, [listRef]);

  return { isAtBottom, handleScroll, scrollToBottom };
}
