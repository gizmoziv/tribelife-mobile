// ShabbatAnnouncementCard — one-time "New: Shabbat & Yom Tov Mode" card at the
// top of the Chats tab (Phase 45, D-11 / D-15 / SHAB-09).
//
// Self-contained: on mount it reads a local AsyncStorage mirror (so it never
// flickers back after a remount) and otherwise asks GET /shabbat-status
// whether the server has recorded the announcement as seen. Both actions
// ("Turn on" and the close button) write the mirror and tell the server, so
// the dismissal also survives a reinstall. If the status call fails (older
// backend, offline) the card stays hidden — silently.
//
// The caller is responsible for NOT rendering this while the Phase-44 intro
// gate is showing.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { notificationsApi } from '@/services/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { FONTS, SPACING } from '@/constants';

const SEEN_KEY = 'shabbat_announcement_seen';

export function ShabbatAnnouncementCard() {
  const { colors } = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    (async () => {
      try {
        // The mirror stores the user id (not a bare flag) so a second account
        // on a shared device still gets its own one-time announcement.
        const mirror = await AsyncStorage.getItem(SEEN_KEY);
        if (mirror === String(userId)) return;
        const status = await notificationsApi.getShabbatStatus();
        if (cancelled) return;
        if (status.announcementSeen === false) {
          setVisible(true);
        } else {
          AsyncStorage.setItem(SEEN_KEY, String(userId)).catch(() => {});
        }
      } catch {
        /* status unavailable — stay hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeenLocally = useCallback(() => {
    if (userId == null) return;
    AsyncStorage.setItem(SEEN_KEY, String(userId)).catch(() => {});
  }, [userId]);

  const handleTurnOn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setVisible(false);
    markSeenLocally();
    try {
      await notificationsApi.updatePreferences({
        shabbatMode: true,
        shabbatAnnouncementSeen: true,
      });
    } catch {
      // Not saved — bring the card back so the user can retry.
      if (userId != null) AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
      setVisible(true);
      Alert.alert(
        'Something went wrong',
        "Couldn't turn on Shabbat & Yom Tov Mode. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, markSeenLocally, userId]);

  const handleDismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisible(false);
    markSeenLocally();
    // Non-critical: the local mirror already hides it on this device.
    notificationsApi
      .updatePreferences({ shabbatAnnouncementSeen: true })
      .catch(() => {});
  }, [markSeenLocally]);

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <GlassCard>
        <View style={styles.inner}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              New: Shabbat &amp; Yom Tov Mode
            </Text>
            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={[styles.close, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Pause notifications from candle lighting to Havdalah. We&apos;ll
            send one summary after.
          </Text>
          <View style={styles.actions}>
            <PillButton
              title="Turn on"
              size="sm"
              onPress={handleTurnOn}
              disabled={busy}
            />
          </View>
        </View>
      </GlassCard>
    </View>
  );
}

export default ShabbatAnnouncementCard;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACING.page,
    paddingBottom: SPACING.sm,
  },
  inner: {
    padding: SPACING.md,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  close: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  body: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 4,
  },
});
