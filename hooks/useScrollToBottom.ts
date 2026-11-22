import { useCallback, useState, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useScrollPositionGuard } from '@/hooks/useScrollPositionGuard';

const SCROLL_TO_BOTTOM_THRESHOLD = 100;

// Message lists render `inverted`, so contentOffset.y === 0 is the newest
// message (the visual bottom) — "at bottom" means still within threshold of it.
//
// Also owns the list's scroll-position guard (see useScrollPositionGuard): the
// returned `handleScroll` feeds it, `scrollToBottom` releases it (the reader
// asked to go down), and `scrollGuard` is exposed so the screen can pin the
// reader's offset around in-place message updates (reactions) and spread
// `scrollGuard.dragProps` onto the FlatList.
export function useScrollToBottom(listRef: RefObject<FlatList<any> | null>) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollGuard = useScrollPositionGuard(listRef);
  const guardOnScroll = scrollGuard.onScroll;
  const guardRelease = scrollGuard.release;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIsAtBottom(e.nativeEvent.contentOffset.y < SCROLL_TO_BOTTOM_THRESHOLD);
    guardOnScroll(e);
  }, [guardOnScroll]);

  const scrollToBottom = useCallback(() => {
    guardRelease();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setIsAtBottom(true);
  }, [listRef, guardRelease]);

  return { isAtBottom, handleScroll, scrollToBottom, scrollGuard };
}
