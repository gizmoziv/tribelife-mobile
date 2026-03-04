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
import { FONTS, COLORS } from '@/constants';
import type { Notification } from '@/types';

const ICONS: Record<string, string> = {
  mention: '💬',
  beacon_match: '✨',
  new_dm: '✉️',
  system: '🔔',
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
        // Navigate to the chat room where mention happened
        router.push('/(app)/chat');
        break;
      case 'new_dm':
        if (data.conversationId) {
          router.back();
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={[styles.markAll, { color: COLORS.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 40 }}>🔔</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up!</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Notifications for mentions and beacon matches will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.notifRow,
                {
                  backgroundColor: item.isRead ? colors.background : colors.surface,
                  borderBottomColor: colors.border,
                },
              ]}
              onPress={() => handleNotificationPress(item)}
            >
              <Text style={styles.notifIcon}>{ICONS[item.type] ?? '🔔'}</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontFamily: FONTS.bold },
  markAll: { fontSize: 14, fontFamily: FONTS.medium },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptySubtitle: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notifIcon: { fontSize: 22, marginTop: 2 },
  notifTitle: { fontSize: 14, fontFamily: FONTS.semiBold, marginBottom: 2 },
  notifBody: { fontSize: 13, fontFamily: FONTS.regular, lineHeight: 20 },
  notifTime: { fontSize: 12, fontFamily: FONTS.regular, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
  },
});
