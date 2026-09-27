import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDraftController, type DraftController } from '@/utils/chatDraft';

export { conversationDraftKey, roomDraftKey } from '@/utils/chatDraft';

/**
 * Persists unsent composer text to AsyncStorage, keyed by `key`. Loads once
 * per key per mount (never clobbering text already typed), debounces writes,
 * and flushes the latest text immediately on unmount and whenever the app
 * leaves the 'active' AppState (covers backgrounding and an OS kill before
 * the debounce fires).
 */
export function useDraftMessage(key: string | null | undefined): [string, (text: string) => void, () => void] {
  const [text, setTextState] = useState('');
  const controllerRef = useRef<DraftController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createDraftController({
      storage: AsyncStorage,
      onTextChange: setTextState,
    });
  }

  useEffect(() => {
    controllerRef.current?.setKey(key ?? null);
  }, [key]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        controllerRef.current?.flush();
      }
    });
    return () => {
      subscription.remove();
      controllerRef.current?.flush();
    };
  }, []);

  const setText = useCallback((next: string) => {
    controllerRef.current?.setText(next);
  }, []);

  const clearDraft = useCallback(() => {
    controllerRef.current?.clear();
  }, []);

  return [text, setText, clearDraft];
}
