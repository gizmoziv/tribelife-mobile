import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_VISUAL_HEIGHT = 70;
const CONTENT_GAP = 8;

/**
 * Returns the total bottom padding content needs to clear the docked
 * tab bar (lives at bottom: 0, full width, height = 70 + insets.bottom).
 *
 * Platform branching is required because the chat / chevra screens use
 * the built-in react-native SafeAreaView, which:
 *   - iOS:     absorbs insets.bottom for us — its bottom edge sits at
 *              insets.bottom from the screen bottom, so paddingBottom
 *              only needs to clear the tab bar's visible height.
 *   - Android: does nothing with insets — its bottom edge sits at 0, so
 *              paddingBottom must include the system-nav inset on top of
 *              the tab bar's height.
 *
 * Getting this wrong on iOS leaks an extra insets.bottom (~34px) into
 * the conversation screen's input-bar paddingBottom, which the keyboard
 * transition then has to swallow and causes scroll-to-end oscillation.
 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') {
    return TAB_BAR_VISUAL_HEIGHT + CONTENT_GAP;
  }
  return TAB_BAR_VISUAL_HEIGHT + insets.bottom + CONTENT_GAP;
}
