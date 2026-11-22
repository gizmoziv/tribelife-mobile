import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// Prompt-free clipboard-image detection for the chat composers (phase 46).
// Only metadata calls are used here: hasImageAsync (iOS UIPasteboard.hasImages /
// Android ClipDescription mime) and the clipboard-change listener's
// contentTypes. Reading the image itself happens only on an explicit chip tap
// (see PasteImageChip) so the iOS 16+ "Allow Paste" alert never fires on focus.
export function useClipboardImage(active: boolean): { hasImage: boolean; refresh: () => void } {
  const [hasImage, setHasImage] = useState(false);

  const refresh = useCallback(() => {
    Clipboard.hasImageAsync()
      .then(setHasImage)
      .catch(() => setHasImage(false));
  }, []);

  useEffect(() => {
    if (!active) {
      setHasImage(false);
      return;
    }

    refresh();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const clipboardSub = Clipboard.addClipboardListener((event) => {
      setHasImage(event.contentTypes.includes(Clipboard.ContentType.IMAGE));
    });

    return () => {
      appStateSub.remove();
      clipboardSub.remove();
    };
  }, [active, refresh]);

  return { hasImage, refresh };
}

export default useClipboardImage;
