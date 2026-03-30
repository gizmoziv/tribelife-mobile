import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 70;
const TAB_BAR_MARGIN = 12;
const CONTENT_GAP = 8;

/**
 * Returns the total bottom padding for content behind the floating tab bar.
 *
 * iOS: Tab bar sits at bottom: insets.bottom + 12. Content just needs to clear
 * the tab bar itself (height + margin + gap). The safe area inset is handled
 * by the tab bar's bottom position.
 *
 * Android: insets.bottom varies (0 for gesture nav, ~48 for 3-button nav).
 * Content needs the full inset since the tab bar floats above the nav buttons.
 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') {
    return TAB_BAR_HEIGHT + TAB_BAR_MARGIN + CONTENT_GAP;
  }
  return TAB_BAR_HEIGHT + TAB_BAR_MARGIN + insets.bottom + CONTENT_GAP;
}
