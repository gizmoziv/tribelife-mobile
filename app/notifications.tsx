import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotificationStore, selectBellCount } from '@/store/notificationStore';
import { useChatsStore } from '@/store/chatsStore';
import { useGlobeStore } from '@/store/globeStore';
import { chat, globeApi, notificationsApi } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import type { Notification } from '@/types';
import Svg, { Path } from 'react-native-svg';

function GroupsIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#818CF8" strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="#818CF8" strokeWidth={1.5} />
      <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#818CF8" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

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
  org_invite: () => <BellIcon />,
};

const ICON_COLORS: Record<string, string> = {
  mention: COLORS.primary,
  beacon_match: COLORS.accent,
  new_dm: COLORS.secondary,
  system: '#7A8BA8',
  org_invite: COLORS.primary,
};

type TabKey = 'groups' | 'dms' | 'matches' | 'system';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'groups', label: 'Groups' },
  { key: 'dms', label: 'DMs' },
  { key: 'matches', label: 'Matches' },
  { key: 'system', label: 'System' },
];

const EMPTY_COPY: Record<TabKey, { title: string; subtitle: string }> = {
  groups: { title: 'All caught up', subtitle: 'Unread group and community chats will show their count here. Head to Chats to see them.' },
  dms: { title: 'No new messages', subtitle: 'Mentions, replies, and direct messages land here.' },
  matches: { title: 'No matches yet', subtitle: 'Daily beacon matches will appear here once the matcher runs.' },
  system: { title: 'All quiet', subtitle: 'Moderation notices and system announcements appear here.' },
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { notifications, summary, setNotifications, setSummary, markTypeRead, markOneRead } = useNotificationStore();
  const bellCount = useNotificationStore(selectBellCount);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('groups');

  useEffect(() => {
    notificationsApi.list().then(({ notifications: notifs, unreadCount: count }) => {
      setNotifications(notifs, count);
    }).catch(() => {});
    notificationsApi.summary().then(setSummary).catch(() => {});
  }, []);

  // Groups tab: no stored notification rows — derived from chatsStore unread state.
  // DMs tab: collapse to one row per conversation. Mentions fold into DMs.
  // Matches/System: one row per event.
  const visibleNotifications = useMemo(() => {
    if (activeTab === 'groups') {
      // Groups has no stored notification rows — empty list with empty-state copy.
      return [] as Notification[];
    }
    const ofType = notifications.filter((n) =>
      activeTab === 'system'
        ? n.type === 'system' || n.type === 'org_invite'
        : activeTab === 'dms'
        ? n.type === 'mention' || n.type === 'new_dm'
        : activeTab === 'matches'
        ? n.type === 'beacon_match'
        : false,
    );
    if (activeTab !== 'dms') return ofType;
    // DMs: collapse by conversation (same logic as old new_dm tab, now spans mention+new_dm).
    const seen = new Set<string>();
    const collapsed: Notification[] = [];
    for (const n of ofType) {
      const convoId = (n.data as Record<string, unknown>)?.conversationId;
      const key = convoId != null ? `c:${String(convoId)}` : `n:${n.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collapsed.push(n);
    }
    return collapsed;
  }, [notifications, activeTab]);

  // Clearing a bell tab cascades to the sources those events came from.
  // The API contract is TAB-keyed (?tab=<tab>) per Plan 16-03 W1/W2 LOCKED.
  // readAll('dms') clears BOTH mention AND new_dm rows server-side (W1).
  // readAll('groups') runs the read-position cascade and returns cleared source IDs.
  const handleMarkTabRead = async () => {
    const prev = summary;

    // Optimistic local clear:
    // DMs tab spans TWO notification types — clear both explicitly.
    // markTypeRead keys on n.type via summaryKeyForType, so passing a tab name
    // ('dms') would match nothing. Call per-type explicitly for DMs.
    if (activeTab === 'dms') {
      markTypeRead('mention');
      markTypeRead('new_dm');
    } else if (activeTab === 'matches') {
      markTypeRead('beacon_match');
    } else if (activeTab === 'system') {
      markTypeRead('system');
      // org_invite shares the system tab
      markTypeRead('org_invite');
    }
    // 'groups' has no stored notification types to clear locally.

    try {
      const resp = await notificationsApi.readAll(activeTab);

      if (activeTab === 'groups') {
        // Groups mark-read: zero matching chatsStore rows from the returned IDs.
        const chatsState = useChatsStore.getState();
        for (const slug of resp.clearedGlobeSlugs) {
          chatsState.clearRowUnread({ type: 'globe_room', roomSlug: slug });
        }
        for (const convId of resp.clearedConversationIds) {
          // Groups tab covers group conversations (not 1:1 DMs)
          chatsState.clearRowUnread({ type: 'group', conversationId: convId });
        }
        for (const tz of resp.clearedTimezoneRooms) {
          chatsState.clearRowUnread({ type: 'local_chat', timezoneIana: tz });
        }
      } else if (resp.clearedConversationIds.length > 0 || resp.clearedTimezoneRooms.length > 0) {
        // DMs/Matches/System: re-hydrate chatsStore if DM sources were touched.
        useChatsStore.getState().hydrate();
      }

      if (resp.clearedGlobeSlugs.length > 0 && activeTab !== 'groups') {
        globeApi.unread()
          .then(({ unread }) => useGlobeStore.getState().setUnreadCounts(unread))
          .catch(() => {});
      }

      // Authoritative refresh of per-tab summary (picks up any cross-type
      // notifications the backend cascade cleared).
      notificationsApi.summary().then(setSummary).catch(() => {});
    } catch {
      setSummary(prev);
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    markOneRead(notification.id);
    notificationsApi.read(notification.id).catch(() => {});

    const data = notification.data as Record<string, unknown>;

    switch (notification.type) {
      case 'mention':
        router.push('/(app)/chat');
        break;
      case 'new_dm':
        if (data.conversationId) {
          router.push({
            pathname: '/(app)/chat/[conversationId]',
            params: { conversationId: String(data.conversationId) },
          });
        }
        break;
      case 'beacon_match':
        router.push({
          pathname: '/(app)/beacon',
          params: { tab: 'matches' },
        });
        break;
      case 'org_invite':
        if (data.token) {
          router.push({
            pathname: '/org/invite/[token]',
            params: { token: String(data.token) },
          });
        }
        break;
    }
  };

  const summaryByTab: Record<TabKey, number> = {
    groups: summary.groups,
    dms: summary.dms,
    matches: summary.matches,
    system: summary.system,
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/chat'))}
            hitSlop={8}
            style={styles.backButton}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
        </View>
        {summaryByTab[activeTab] > 0 && (
          <PillButton
            title="Mark read"
            onPress={handleMarkTabRead}
            variant="outline"
            size="sm"
          />
        )}
      </View>

      {/* Segmented tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const isActive = t.key === activeTab;
          const count = summaryByTab[t.key];
          return (
            <Pressable
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? COLORS.primary : colors.surfaceGlass,
                  borderColor: isActive ? COLORS.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? '#FFF' : colors.text },
                ]}
              >
                {t.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabDot, { backgroundColor: isActive ? '#FFF' : COLORS.accent }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {visibleNotifications.length === 0 ? (
        <View style={styles.empty}>
          <AnimatedEntry>
            <GlassCard>
              <View style={styles.emptyInner}>
                {activeTab === 'groups' ? <GroupsIcon /> : <BellIcon />}
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {EMPTY_COPY[activeTab].title}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                  {EMPTY_COPY[activeTab].subtitle}
                </Text>
              </View>
            </GlassCard>
          </AnimatedEntry>
        </View>
      ) : (
        <FlatList
          data={visibleNotifications}
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  title: { fontSize: 22, fontFamily: FONTS.bold },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.page,
    paddingBottom: SPACING.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
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
