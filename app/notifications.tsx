import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationStore } from '@/store/notificationStore';
import { notificationsApi } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import type { Notification } from '@/types';
import Svg, { Path, Circle } from 'react-native-svg';

function MentionIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#818CF8" strokeWidth={1.5} />
    </Svg>
  );
}

function SparkleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" stroke="#F59E0B" strokeWidth={1.5} />
    </Svg>
  );
}

function EnvelopeIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#34D399" strokeWidth={1.5} />
      <Path d="M22 6l-10 7L2 6" stroke="#34D399" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0" stroke="#7A8BA8" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

const ICON_MAP: Record<string, () => React.ReactNode> = {
  mention: () => <MentionIcon />,
  beacon_match: () => <SparkleIcon />,
  new_dm: () => <EnvelopeIcon />,
  system: () => <BellIcon />,
};

const ICON_COLORS: Record<string, string> = {
  mention: COLORS.primary,
  beacon_match: COLORS.accent,
  new_dm: COLORS.secondary,
  system: '#7A8BA8',
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { notifications, unreadCount, setNotifications, markAllRead } = useNotificationStore();
  const router = useRouter();

  useEffect(() => {
    notificationsApi.list().then(({ notifications: notifs, unreadCount: count }) => {
      setNotifications(notifs, count);
    });
  }, []);

  const handleMarkAllRead = async () => {
    await notificationsApi.readAll();
    markAllRead();
  };

  const handleNotificationPress = (notification: Notification) => {
    notificationsApi.read(notification.id);

    const data = notification.data as Record<string, number>;

    switch (notification.type) {
      case 'mention':
        router.push('/(app)/chat');
        break;
      case 'new_dm':
        if (data.conversationId) {
          router.push({
            pathname: '/(app)/chat/[conversationId]',
            params: { conversationId: data.conversationId.toString() },
          });
        }
        break;
      case 'beacon_match':
        router.push('/(app)/beacon');
        break;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        {unreadCount > 0 && (
          <PillButton
            title="Mark all read"
            onPress={handleMarkAllRead}
            variant="outline"
            size="sm"
          />
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <AnimatedEntry>
            <GlassCard>
              <View style={styles.emptyInner}>
                <BellIcon />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up!</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  Notifications for mentions and beacon matches will appear here.
                </Text>
              </View>
            </GlassCard>
          </AnimatedEntry>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingVertical: SPACING.sm, paddingHorizontal: SPACING.page }}
          renderItem={({ item, index }) => (
            <AnimatedEntry delay={index * 30}>
              <TouchableOpacity
                style={[
                  styles.notifRow,
                  {
                    backgroundColor: item.isRead ? 'transparent' : colors.surfaceGlass,
                    borderColor: item.isRead ? 'transparent' : colors.border,
                  },
                ]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.7}
              >
                {!item.isRead && (
                  <View style={[styles.unreadAccent, { backgroundColor: COLORS.accent }]} />
                )}
                <View style={[styles.notifIconContainer, { backgroundColor: `${ICON_COLORS[item.type] ?? '#7A8BA8'}1A` }]}>
                  {(ICON_MAP[item.type] ?? ICON_MAP.system)()}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.notifBody, { color: colors.textMuted }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                    {formatRelativeTime(item.createdAt)}
                  </Text>
                </View>
                {!item.isRead && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            </AnimatedEntry>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.page,
    paddingVertical: 14,
  },
  title: { fontSize: 22, fontFamily: FONTS.bold },
  empty: { flex: 1, padding: SPACING.xl, justifyContent: 'center' },
  emptyInner: { alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptySubtitle: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  unreadAccent: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  notifIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: { fontSize: 14, fontFamily: FONTS.semiBold, marginBottom: 2 },
  notifBody: { fontSize: 13, fontFamily: FONTS.regular, lineHeight: 20 },
  notifTime: { fontSize: 11, fontFamily: FONTS.regular, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginTop: 6,
  },
});
