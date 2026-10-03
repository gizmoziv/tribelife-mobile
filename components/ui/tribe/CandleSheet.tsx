// CandleSheet — bottom sheet with the candle-lighting details. Mounted ONCE in
// TribeHubScreen; both the strip (All pill) and the Tribe header chip (other
// pills) open it by setting sheetOpen in useTribeHubStore. Chrome copied from
// ActionSheetModal, plus a drag-handle bar and a KeyboardAvoidingView so the
// LocationPicker search field stays above the keyboard.
import React, { useCallback } from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { RADIUS, SPACING } from '@/constants';
import { useTribeHubStore } from '@/store/tribeHubStore';
import type { CandleViewModel } from '@/utils/candleViewModel';
import { CandleLightingCard } from './CandleLightingCard';

export function CandleSheet({ vm }: { vm: CandleViewModel }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const sheetOpen = useTribeHubStore((s) => s.sheetOpen);
  const sheetMode = useTribeHubStore((s) => s.sheetMode);
  const closeSheet = useTribeHubStore((s) => s.closeSheet);
  const setSheetMode = useTribeHubStore((s) => s.setSheetMode);

  // After a location save: refetch, then back to the details view.
  const handleLocationSaved = useCallback(async () => {
    await useTribeHubStore.getState().fetchToday();
    setSheetMode('details');
  }, [setSheetMode]);

  const handleRetry = useCallback(() => {
    void useTribeHubStore.getState().fetchToday();
  }, []);

  return (
    <Modal
      visible={sheetOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Pressable
          style={styles.backdrop}
          onPress={closeSheet}
          accessibilityRole="button"
          accessibilityLabel="Close candle-lighting details"
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={closeSheet}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + SPACING.md,
            },
          ]}
        >
          <View style={styles.handle} />
          <CandleLightingCard vm={vm} mode={sheetMode}
            onModeChange={setSheetMode}
            onLocationSaved={handleLocationSaved}
            onRetry={handleRetry}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.page,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(122,139,168,0.4)',
    alignSelf: 'center',
    marginBottom: 14,
  },
});

export default CandleSheet;
