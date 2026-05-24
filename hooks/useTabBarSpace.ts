import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_VISUAL_HEIGHT = 70;
const CONTENT_GAP = 8;

/**
 * Returns the total bottom padding content needs to clear the docked
 * tab bar.
 *
 * The tab bar lives at bottom: 0 with full width and height
 * = TAB_BAR_VISUAL_HEIGHT + insets.bottom (the inset is absorbed by
 * paddingBottom inside the tab bar so icons sit above the system nav
 * strip on Android / the home indicator on iOS). Content needs to clear
 * the tab bar's full visible footprint plus a small gap.
 */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_VISUAL_HEIGHT + insets.bottom + CONTENT_GAP;
}
