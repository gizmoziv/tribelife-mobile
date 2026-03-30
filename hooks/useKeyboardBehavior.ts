import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingViewProps, Platform } from 'react-native';

/**
 * Dynamic KAV behavior that prevents residual space on Android.
 *
 * Expo SDK 54 enables edge-to-edge by default, which makes `adjustResize`
 * behave like `adjustNothing`. KAV must handle keyboard offset itself.
 *
 * iOS: always 'padding' (standard, works reliably)
 * Android: 'height' when keyboard is shown, undefined when hidden
 *   - 'height' shrinks the view to fit above keyboard
 *   - undefined on hide prevents KAV from retaining residual space
 */
export function useKeyboardBehavior(): KeyboardAvoidingViewProps['behavior'] {
  const [behavior, setBehavior] = useState<KeyboardAvoidingViewProps['behavior']>(
    Platform.OS === 'ios' ? 'padding' : undefined,
  );

  useEffect(() => {
    if (Platform.OS === 'ios') return;

    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setBehavior('height');
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setBehavior(undefined);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return behavior;
}
