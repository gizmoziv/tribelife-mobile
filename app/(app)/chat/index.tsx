import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
  PanResponder,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useKeyboardBehavior } from '@/hooks/useKeyboardBehavior';
import { useScrollToMessage } from '@/hooks/useScrollToMessage';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat, moderationApi, reactionsApi, groupsApi, notificationsApi } from '@/services/api';
import type { ApiError } from '@/services/api';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import type { SearchResult } from '@/types';
import { useNotificationStore } from '@/store/notificationStore';
import { useChatsStore } from '@/store/chatsStore';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { useChatsListRefStore } from '@/store/chatsListRefStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguagePicker } from '@/components/ui/chat/LanguagePicker';
import {
  connectSocket,
  sendRoomMessage,
  onRoomMessage,
  onDirectMessage,
  startTyping,
  stopTyping,
  onTypingStart,
  onTypingStop,
  onMessageRejected,
  onReactionUpdate,
  onMediaRemoved,
  onMediaRejected,
  getSocket,
} from '@/services/socket';
import { AttachmentButton } from '@/components/ui/chat/AttachmentButton';
import { requestMediaUploadUrls, uploadToSpaces, confirmMediaUpload } from '@/services/upload';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import type { ChatsRow } from '@/types';
import { timezoneToZoneName } from '@/utils/timezoneLabel';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { RegionTile } from '@/components/ui/RegionTile';
import { LocalRoomTile } from '@/components/ui/LocalRoomTile';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
import { MentionAutocomplete, type MentionScope } from '@/components/ui/chat/MentionAutocomplete';
import { MentionTextInput } from '@/components/ui/chat/MentionTextInput';
import { SwipeableMessage } from '@/components/ui/chat/SwipeableMessage';
import type { Message, Conversation, ReactionGroup } from '@/types';
import Svg, { Path } from 'react-native-svg';

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ChatsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  // Phase 10 D-07: useChatsStore is the single source of truth for the
  // Chats screen rows + per-row unread counts. Replace the local
  // useState fetch with a Zustand subscription.
  const rows = useChatsStore((s) => s.rows);
  const isLoading = useChatsStore((s) => s.loading);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const flatListRef = useRef<FlatList<ChatsRow>>(null);

  // Phase 14 SRCH-02: message search state
  const [messageResults, setMessageResults] = useState<SearchResult[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPaginating, setIsPaginating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate on focus (so reads from inside a DM/group/room pop the user
  // back here with fresh server-authoritative unreadCount). The store's
  // _hydrating flag dedupes concurrent calls.
  useFocusEffect(
    useCallback(() => {
      useChatsStore.getState().hydrate();
    }, []),
  );

  // 200ms debounce on the search input (per CONTEXT.md D-06)
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Phase 14 SRCH-02: message search effect — fires when debouncedQuery >= 3 chars.
  // Each keystroke aborts the previous in-flight request via AbortController.
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 3) {
      setMessageResults([]);
      setSearchCursor(null);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    chat.search(q, undefined, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setMessageResults(res.results);
        setSearchCursor(res.nextCursor ?? null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const apiErr = err as ApiError;
        if (apiErr?.status === 429) {
          Alert.alert('Search unavailable', 'Too many searches. Please wait a moment and try again.');
        } else {
          console.warn('[search]', err);
        }
        setMessageResults([]);
        setSearchCursor(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      });

    return () => {
      abortRef.current?.abort();
    };
  }, [debouncedQuery]);

  // Phase 14 SRCH-02: load more results (next page).
  const handleLoadMore = useCallback(() => {
    const q = debouncedQuery.trim();
    if (!searchCursor || isPaginating || q.length < 3) return;

    const controller = new AbortController();
    setIsPaginating(true);
    chat.search(q, searchCursor, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setMessageResults((prev) => [...prev, ...res.results]);
        setSearchCursor(res.nextCursor ?? null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const apiErr = err as ApiError;
        if (apiErr?.status === 429) {
          Alert.alert('Search unavailable', 'Too many searches. Please wait a moment and try again.');
        } else {
          console.warn('[search paginate]', err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsPaginating(false);
      });
  }, [debouncedQuery, searchCursor, isPaginating]);

  // Filtered view by title (case-insensitive substring on the row title only).
  // Title derivation matches ChatsListRow:
  //   - local_chat: timezoneToZoneName(row.timezoneIana)
  //   - town_square: 'Town Square'
  //   - dm: '@' + row.partner.handle
  //   - group: row.name
  const filteredRows = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const tokens = chatsRowSearchTokens(row);
      return tokens.includes(q);
    });
  }, [rows, debouncedQuery]);

  // Register the re-tap callback. The ChatsScreen owns both the search-clear
  // setter and the FlatList ref, so the store's action is just a closure
  // around them. Re-register on every render so the closure captures the
  // latest setSearchQuery (no stale-state bug).
  useEffect(() => {
    useChatsListRefStore.setState({
      clearAndScrollToTop: () => {
        setSearchQuery('');
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    });
    return () => {
      useChatsListRefStore.setState({
        clearAndScrollToTop: () => { /* no-op after unmount */ },
      });
    };
  }, []);

  if (isLoading) return <LoadingState />;

  const trimmedQuery = debouncedQuery.trim();
  const isActiveSearch = trimmedQuery.length > 0;
  const isMessageSearch = trimmedQuery.length >= 3;

  // Determine empty state: both sections empty and a query is present
  const bothEmpty = filteredRows.length === 0 && messageResults.length === 0 && !isSearching;

  // Show the two-section search layout when there is any query
  // (Title matches always shows for any length; Messages section only >= 3 chars)
  if (isActiveSearch) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <TextInput
              style={[styles.searchInput, styles.searchInputWithClear, {
                backgroundColor: colors.surfaceGlass,
                color: colors.text,
                borderColor: colors.border,
              }]}
              placeholder="Search chats"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.searchClearButton}
                hitSlop={10}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
              >
                <Text style={[styles.searchClearText, { color: colors.textMuted }]}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {bothEmpty && !isSearching ? (
          <View style={styles.emptyMatches}>
            <Text style={[styles.emptyMatchesText, { color: colors.textMuted }]}>
              {'No matches for "' + debouncedQuery + '"'}
            </Text>
          </View>
        ) : (
          <ScrollView
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingVertical: SPACING.sm }}
          >
            {/* Chats section (matches the chat's title/badge — tap goes to the chat's latest messages) */}
            {filteredRows.length > 0 && (
              <>
                <Text style={[styles.searchSectionLabel, { color: colors.textMuted }]}>
                  Chats
                </Text>
                {filteredRows.map((row) => (
                  <ChatsListRow key={chatsRowKey(row)} row={row} colors={colors} router={router} />
                ))}
              </>
            )}

            {/* Messages section — only shown when query >= 3 chars */}
            {isMessageSearch && (
              <>
                {(isSearching || messageResults.length > 0) && (
                  <Text style={[styles.searchSectionLabel, { color: colors.textMuted }]}>
                    Messages
                  </Text>
                )}
                {isSearching && messageResults.length === 0 ? (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.primary}
                    style={{ marginVertical: 16 }}
                  />
                ) : (
                  <>
                    {messageResults.map((result) => (
                      <MessageResultRow
                        key={`msg-${result.messageId}`}
                        result={result}
                        queryString={trimmedQuery}
                        colors={colors}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (result.source === 'dm' || result.source === 'group') {
                            // The chat detail screen renders its header from
                            // isGroup/groupName/handle params — without them
                            // the title falls back to the route placeholder
                            // `[conversationId]`. chatTitle from server is the
                            // group name for groups, `@otherHandle` for DMs.
                            const isGroupResult = result.source === 'group';
                            router.push({
                              pathname: '/(app)/chat/[conversationId]',
                              params: {
                                conversationId: String(result.conversationId),
                                aroundMessageId: String(result.messageId),
                                ...(isGroupResult
                                  ? { isGroup: 'true', groupName: result.chatTitle }
                                  : { handle: result.chatTitle.replace(/^@/, '') }),
                              },
                            });
                          } else if (result.source === 'globe_room') {
                            router.push({
                              pathname: '/(app)/globe/[roomSlug]',
                              params: {
                                roomSlug: result.roomSlug,
                                aroundMessageId: String(result.messageId),
                              },
                            });
                          } else if (result.source === 'local_chat') {
                            router.push({
                              pathname: '/(app)/chat/local',
                              params: {
                                aroundMessageId: String(result.messageId),
                              },
                            });
                          }
                        }}
                      />
                    ))}
                    {searchCursor !== null && (
                      <TouchableOpacity
                        onPress={handleLoadMore}
                        disabled={isPaginating}
                        style={styles.loadMoreButton}
                      >
                        {isPaginating ? (
                          <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                          <Text style={[styles.loadMoreText, { color: colors.textMuted }]}>
                            Load more results
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={[styles.searchInput, styles.searchInputWithClear, {
              backgroundColor: colors.surfaceGlass,
              color: colors.text,
              borderColor: colors.border,
            }]}
            placeholder="Search chats"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
              hitSlop={10}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Text style={[styles.searchClearText, { color: colors.textMuted }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <ChatsList data={filteredRows} flatListRef={flatListRef} />
    </SafeAreaView>
  );
}

// Pure title derivation — kept in sync with ChatsListRow's title computation.
function chatsRowTitle(row: ChatsRow): string {
  switch (row.type) {
    case 'local_chat': return timezoneToZoneName(row.timezoneIana);
    case 'town_square': return 'Town Square';
    case 'dm': return '@' + row.partner.handle;
    case 'group': return row.name;
    case 'globe_room': return row.displayName;
    case 'timezone_room': return row.displayName;
  }
}

// Lowercased searchable tokens for the Chats-section filter. Wider than the
// display title so users can search by the badge/pill label they see on the
// row (e.g. "local chat" hits the <LocalPill> on the local_chat row even
// though its display title is the timezone name).
function chatsRowSearchTokens(row: ChatsRow): string {
  const title = chatsRowTitle(row).toLowerCase();
  if (row.type === 'local_chat') return `${title} local chat`;
  // Phase 15 (TZRM-01): joined non-native timezone rooms surface in search via
  // their display name + the "timezone room" token (mirrors the LOCAL pill
  // pattern so "timezone" also returns the row).
  if (row.type === 'timezone_room') return `${title} timezone room`;
  return title;
}

// ── Phase 14: Snippet helper (D-05) ──────────────────────────────────────
// Returns an 80-char window centred on the earliest matching query term as a
// list of {text, highlighted} spans so the renderer can bold+colour every
// match — not just the anchor term. Multi-term queries tokenize on whitespace
// (e.g. "hello world" against "Hello Great World" highlights BOTH "Hello"
// AND "World").
//
// Centring rules:
//   - Anchor on the earliest case-insensitive match of any term.
//   - Window is 80 chars wide, anchored half-before the match if possible.
//   - Leading '…' if the window doesn't start at 0; trailing '…' if it
//     doesn't end at content.length.
//   - No match → returns the first 80 chars unhighlighted (defensive).
export type SnippetSpan = { text: string; highlighted: boolean };

function snippet(content: string, q: string): SnippetSpan[] {
  const lower = content.toLowerCase();
  const terms = Array.from(
    new Set(q.trim().split(/\s+/).filter((t) => t.length > 0).map((t) => t.toLowerCase())),
  );
  if (terms.length === 0) {
    return [{ text: content.slice(0, 80), highlighted: false }];
  }

  // Find earliest match → anchors the snippet window
  let anchorIdx = -1;
  let anchorLen = 0;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (anchorIdx === -1 || i < anchorIdx)) {
      anchorIdx = i;
      anchorLen = t.length;
    }
  }

  if (anchorIdx === -1) {
    return [{ text: content.slice(0, 80), highlighted: false }];
  }

  const WINDOW = 80;
  const half = Math.floor((WINDOW - anchorLen) / 2);
  let start = Math.max(0, anchorIdx - half);
  let end = Math.min(content.length, anchorIdx + anchorLen + (WINDOW - anchorLen - (anchorIdx - start)));
  if (end === content.length) {
    start = Math.max(0, end - WINDOW);
  }

  // Find every term occurrence within [start, end]
  type Range = { from: number; to: number };
  const ranges: Range[] = [];
  for (const t of terms) {
    let from = lower.indexOf(t, start);
    while (from !== -1 && from < end) {
      ranges.push({ from, to: Math.min(from + t.length, end) });
      from = lower.indexOf(t, from + t.length);
    }
  }
  // Merge overlapping ranges
  ranges.sort((a, b) => a.from - b.from);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }

  // Walk [start, end] and emit alternating spans
  const spans: SnippetSpan[] = [];
  if (start > 0) spans.push({ text: '…', highlighted: false });
  let cursor = start;
  for (const r of merged) {
    if (r.from > cursor) {
      spans.push({ text: content.slice(cursor, r.from), highlighted: false });
    }
    spans.push({ text: content.slice(r.from, r.to), highlighted: true });
    cursor = r.to;
  }
  if (cursor < end) {
    spans.push({ text: content.slice(cursor, end), highlighted: false });
  }
  if (end < content.length) spans.push({ text: '…', highlighted: false });

  return spans;
}

// ── Phase 14: MessageResultRow (SRCH-02) ─────────────────────────────────
// Inline component matching the existing ChatsListRow pattern.
// Container reuses styles.chatsRow directly (no redeclaration).
function MessageResultRow({
  result,
  queryString,
  colors,
  onPress,
}: {
  result: SearchResult;
  queryString: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  const spans = snippet(result.content, queryString);
  const relTime = formatRelativeTime(result.createdAt);

  return (
    <TouchableOpacity
      style={[styles.chatsRow, { backgroundColor: colors.surfaceGlass }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <AvatarCircle name={result.senderHandle} size={40} showRing={false} />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 15, fontFamily: FONTS.semiBold, color: colors.text }}
        >
          {`@${result.senderHandle} · ${result.chatTitle} · ${relTime}`}
        </Text>
        <Text numberOfLines={2} style={{ marginTop: 2 }}>
          {spans.map((s, i) =>
            s.highlighted ? (
              <Text
                key={i}
                style={{ fontSize: 14, fontFamily: FONTS.regular, fontWeight: '700', color: colors.accent }}
              >
                {s.text}
              </Text>
            ) : (
              <Text
                key={i}
                style={{ fontSize: 14, fontFamily: FONTS.regular, color: colors.textMuted }}
              >
                {s.text}
              </Text>
            ),
          )}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Unified Chats List ────────────────────────────────────────────────────
function ChatsList({
  data,
  flatListRef,
}: {
  data: ChatsRow[];
  flatListRef: React.RefObject<FlatList<ChatsRow> | null>;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  const renderRow = useCallback(({ item }: { item: ChatsRow }) => {
    return <ChatsListRow row={item} colors={colors} router={router} />;
  }, [colors, router]);

  return (
    <FlatList
      ref={flatListRef}
      data={data}
      keyExtractor={(item) => chatsRowKey(item)}
      renderItem={renderRow}
      contentContainerStyle={{ paddingVertical: SPACING.sm }}
      keyboardDismissMode="on-drag"
      ListFooterComponent={<View style={{ height: tabBarSpace }} />}
    />
  );
}

// Stable key per row. The backend never recycles `conversationId` between
// DM and Group, but the discriminator prefix removes ambiguity.
function chatsRowKey(row: ChatsRow): string {
  switch (row.type) {
    case 'local_chat': return 'local_chat';
    case 'town_square': return 'town_square';
    case 'dm': return 'dm-' + row.conversationId;
    case 'group': return 'group-' + row.conversationId;
    case 'globe_room': return 'globe_room-' + row.roomSlug;
    // Phase 15 (TZRM-01): one row per joined non-native timezone room. zone
    // slug is unique per zone (e.g. 'pacific-time', 'eastern-time').
    case 'timezone_room': return 'timezone_room-' + row.zoneSlug;
  }
}

function ChatsListRow({
  row,
  colors,
  router,
}: {
  row: ChatsRow;
  colors: ReturnType<typeof useTheme>['colors'];
  router: ReturnType<typeof useRouter>;
}) {
  const onPress = useCallback(() => {
    Keyboard.dismiss();
    if (row.type === 'local_chat') {
      // Local Chat opens the dedicated timezone-room screen in the Chats stack.
      router.push('/(app)/chat/local');
      return;
    }
    if (row.type === 'town_square') {
      // Town Square lives in the Chats stack so back-navigation returns here,
      // not to the Globe tab. See chat/town-square.tsx.
      router.push('/(app)/chat/town-square');
      return;
    }
    // Phase 11 D-13: joined regional Globe room → Chats-stack mirror so
    // back-press returns to the Chats list (not the Community tab).
    if (row.type === 'globe_room') {
      router.push('/(app)/chat/regional/' + row.roomSlug);
      return;
    }
    // Phase 15 (TZRM-01): joined non-native timezone room → existing
    // globe/[roomSlug] chat screen (the slug IS the zone slug, e.g.
    // 'eastern-time'). The globe chat screen's socket subscribe + GET
    // /messages path already works post-Plan-15-03 because backend dispatch
    // accepts timezone-slugs.
    if (row.type === 'timezone_room') {
      router.push('/(app)/globe/' + row.zoneSlug);
      return;
    }
    // DM and Group rows route to the existing conversation screen.
    router.push({
      pathname: '/(app)/chat/[conversationId]',
      params: {
        conversationId: row.conversationId.toString(),
        ...(row.type === 'dm'
          ? { handle: row.partner.handle }
          : { isGroup: 'true', groupName: row.name, isArchived: row.isArchived ? 'true' : 'false' }),
      },
    });
  }, [row, router]);

  // ── Icon container + tint ─────────────────────────────────────────────
  let leadingIcon: React.ReactNode;
  let title: string;
  let subtitle: string;
  let isGroupRow = false;
  let groupIsPublic = false;
  let isLocalRow = false;
  let isGlobalRow = false;

  if (row.type === 'local_chat') {
    leadingIcon = <LocalRoomTile size={44} />;
    title = timezoneToZoneName(row.timezoneIana);
    subtitle = row.lastMessage?.preview ?? 'Your timezone';
    isLocalRow = true;
  } else if (row.type === 'town_square') {
    leadingIcon = <RegionTile slug="town-square" size={44} />;
    title = 'Town Square';
    subtitle = row.lastMessage?.preview ?? 'A global space';
    isGlobalRow = true;
  } else if (row.type === 'globe_room') {
    leadingIcon = <RegionTile slug={row.roomSlug} size={44} />;
    title = row.displayName;
    subtitle = row.lastMessage?.preview ?? 'Regional community';
    // showLock stays `false` — Globe rooms aren't private (Phase 9 D-05 only applies to groups).
  } else if (row.type === 'timezone_room') {
    // Phase 15 (TZRM-01): joined non-native timezone room. RegionTile takes
    // any slug — for timezone slugs (e.g. 'eastern-time') it falls back to
    // the default '··' abbreviation since GLOBE_ROOM_VISUALS only holds the
    // 7 globe rooms. UI polish for timezone-specific abbreviations is
    // additive (not in Plan 15-05 scope).
    leadingIcon = <RegionTile slug={row.zoneSlug} size={44} />;
    title = row.displayName;
    subtitle = row.lastMessage?.preview ?? 'Timezone community';
  } else if (row.type === 'dm') {
    leadingIcon = (
      <AvatarCircle
        name={row.partner.handle ?? '?'}
        size={44}
        imageUrl={row.partner.avatarUrl ?? undefined}
      />
    );
    title = '@' + row.partner.handle;
    subtitle = row.lastMessage?.preview ?? 'Start a conversation';
  } else {
    // group
    leadingIcon = (
      <AvatarCircle
        name={row.name}
        size={44}
        imageUrl={row.iconUrl ?? undefined}
      />
    );
    title = row.name;
    subtitle = row.lastMessage?.preview ?? (row.memberCount + ' members');
    isGroupRow = !row.isArchived;
    groupIsPublic = row.isPublic;
  }

  return (
    <TouchableOpacity
      style={[styles.chatsRow, { backgroundColor: colors.surfaceGlass }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {leadingIcon}
      <View style={{ flex: 1 }}>
        <View style={styles.chatsRowTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Text style={[styles.chatsRowTitle, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            {isLocalRow && <LocalPill />}
            {isGlobalRow && <GlobalPill />}
            {isGroupRow && <GroupPill />}
            {isGroupRow && !groupIsPublic && <PrivatePill />}
            {row.type === 'group' && row.isArchived && (
              <View style={[styles.archivedPill, { backgroundColor: colors.textMuted + '22' }]}>
                <Text style={[styles.archivedPillText, { color: colors.textMuted }]}>Archived</Text>
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {row.lastMessage && (
              <Text style={[styles.chatsRowTime, { color: colors.textMuted }]}>
                {formatTime(row.lastMessage.at)}
              </Text>
            )}
            {row.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {row.unreadCount > 99 ? '99+' : row.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={[styles.chatsRowPreview, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function LocalPill() {
  return (
    <View
      style={{
        backgroundColor: 'rgba(52,211,153,0.15)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.success }}>
        LOCAL
      </Text>
    </View>
  );
}

function GlobalPill() {
  return (
    <View
      style={{
        backgroundColor: 'rgba(192,132,252,0.15)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: '#C084FC' }}>
        GLOBAL
      </Text>
    </View>
  );
}

function GroupPill() {
  return (
    <View
      style={{
        backgroundColor: COLORS.primaryGlow,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.primary }}>
        GROUP
      </Text>
    </View>
  );
}

function PrivatePill() {
  return (
    <View
      style={{
        backgroundColor: COLORS.accentSoft,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.accent }}>
        PRIVATE
      </Text>
    </View>
  );
}

// ── Local (Timezone Room) Chat ────────────────────────────────────────────
function LocalChatPanel() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const keyboardBehavior = useKeyboardBehavior();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; senderHandle: string; content: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [translations, setTranslations] = useState<Record<number, { text: string; showing: boolean }>>({});
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<string>('English');
  const flatListRef = useRef<FlatList>(null);
  const hasScrolledRef = useRef(false);
  const { highlightedId, scrollToMessage } = useScrollToMessage(flatListRef, messages);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const roomId = `timezone:${user?.timezone ?? 'UTC'}`;

  useEffect(() => {
    AsyncStorage.getItem('preferredTranslateLanguage').then((lang) => {
      if (lang) setPreferredLanguage(lang);
    });
  }, []);

  // Clear bell notifications tied to this zone room when the user opens it
  // directly — same rationale as the DM chat screen. Server marks read;
  // local store update keeps the bell count in sync without a refetch.
  useEffect(() => {
    notificationsApi.readContext({ roomId })
      .then(({ markedRead }) => {
        if (markedRead.length > 0) {
          useNotificationStore.getState().markManyRead(markedRead);
          // Phase 14: refetch summary — fresh chat:notification mentions
          // aren't always in the local notifications[] array.
          notificationsApi.summary()
            .then((s) => useNotificationStore.getState().setSummary(s))
            .catch(() => {});
        }
      })
      .catch(() => { /* silent */ });
  }, [roomId]);

  // Mark this panel as the active foreground context so the _layout.tsx
  // `room:message` listener knows not to increment the Chat tab bubble while
  // the user is actively reading here, and wipe any bubble that accumulated
  // while they were on another tab.
  useFocusEffect(
    useCallback(() => {
      useForegroundContextStore.getState().setContext({ type: 'localChat' });
      // Phase 10: unread reset handled by useChatsStore in chat/local.tsx
      return () => {
        const ctx = useForegroundContextStore.getState().context;
        if (ctx.type === 'localChat') {
          useForegroundContextStore.getState().setContext({ type: 'none' });
        }
      };
    }, [])
  );

  useEffect(() => {
    chat.getRoomMessages(roomId).then(({ messages: msgs }) => {
      setMessages(msgs);
      setIsLoading(false);
      // Multiple scroll attempts for Android's slower rendering pipeline
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 500);
    }).catch(() => setIsLoading(false));

    const cleanups: (() => void)[] = [];

    connectSocket().then(() => {
      const offRoom = onRoomMessage((msg) => {
        setMessages((prev) => [...prev, msg]);
        flatListRef.current?.scrollToEnd({ animated: true });
      });

      // Auto-clear each user's typing indicator 5s after their last typing:start
      // so a missed typing:stop (e.g. socket dropped while backgrounded) can't
      // leave someone permanently "typing...".
      const TYPING_TIMEOUT_MS = 5000;
      const clearTypingLater = (handle: string) => {
        const existing = typingClearTimersRef.current.get(handle);
        if (existing) clearTimeout(existing);
        typingClearTimersRef.current.set(
          handle,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((h) => h !== handle));
            typingClearTimersRef.current.delete(handle);
          }, TYPING_TIMEOUT_MS),
        );
      };

      const offTypingStart = onTypingStart(({ handle }) => {
        if (handle === user?.handle) return;
        setTypingUsers((prev) => prev.includes(handle) ? prev : [...prev, handle]);
        clearTypingLater(handle);
      });

      const offTypingStop = onTypingStop(({ handle }) => {
        setTypingUsers((prev) => prev.filter((h) => h !== handle));
        const existing = typingClearTimersRef.current.get(handle);
        if (existing) {
          clearTimeout(existing);
          typingClearTimersRef.current.delete(handle);
        }
      });

      const offRejected = onMessageRejected(({ reason }) => {
        Alert.alert(
          'Message Not Sent',
          reason ?? 'Your message was rejected. It may violate community guidelines.',
        );
      });

      const offMediaRemoved = onMediaRemoved((data) => {
        setMessages((prev) => prev.map((msg) => {
          if (msg.id === data.messageId) {
            return { ...msg, mediaUrls: data.remainingUrls.length > 0 ? data.remainingUrls : null };
          }
          return msg;
        }));
      });

      const offMediaRejected = onMediaRejected((data) => {
        Alert.alert('Image Removed', data.message);
      });

      cleanups.push(offRoom, offTypingStart, offTypingStop, offRejected, offMediaRemoved, offMediaRejected);
    });

    return () => {
      cleanups.forEach(fn => fn());
      // Clear any outstanding typing auto-clear timers
      typingClearTimersRef.current.forEach((t) => clearTimeout(t));
      typingClearTimersRef.current.clear();
    };
  }, [roomId]);

  // Recover after socket drops / backgrounding: refetch the room's messages
  // on foreground and on socket reconnect, and reset any stale typing state.
  useEffect(() => {
    const refetchRoom = async () => {
      setTypingUsers([]);
      typingClearTimersRef.current.forEach((t) => clearTimeout(t));
      typingClearTimersRef.current.clear();
      try {
        const { messages: fresh } = await chat.getRoomMessages(roomId);
        setMessages((prev) => {
          const pending = prev.filter((m) => m.id < 0); // preserve optimistic
          return [...fresh, ...pending];
        });
      } catch { /* silent */ }
    };

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchRoom();
    });
    const socket = getSocket();
    const onConnect = () => refetchRoom();
    socket?.on('connect', onConnect);

    return () => {
      appSub.remove();
      socket?.off('connect', onConnect);
    };
  }, [roomId]);

  // ── Real-time reaction updates ──────────────────────────────────────────
  useEffect(() => {
    const offReaction = onReactionUpdate((data) => {
      if (data.roomId && data.roomId !== roomId) return;
      // Only process reactions that have a roomId (timezone room context)
      if (!data.roomId) return;
      // Skip own reactions — already applied optimistically in handleReact
      if (data.userId === user?.id) return;

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== data.messageId) return msg;
          const reactions = [...(msg.reactions ?? [])];
          const idx = reactions.findIndex((r) => r.emoji === data.emoji);

          if (data.action === 'add') {
            if (idx >= 0) {
              reactions[idx] = {
                ...reactions[idx],
                count: reactions[idx].count + 1,
                userIds: [...reactions[idx].userIds, data.userId],
                hasReacted: data.userId === user?.id ? true : reactions[idx].hasReacted,
              };
            } else {
              reactions.push({
                emoji: data.emoji,
                count: 1,
                userIds: [data.userId],
                hasReacted: data.userId === user?.id,
              });
            }
          } else {
            if (idx >= 0) {
              const updated = {
                ...reactions[idx],
                count: reactions[idx].count - 1,
                userIds: reactions[idx].userIds.filter((id) => id !== data.userId),
                hasReacted: data.userId === user?.id ? false : reactions[idx].hasReacted,
              };
              if (updated.count <= 0) {
                reactions.splice(idx, 1);
              } else {
                reactions[idx] = updated;
              }
            }
          }

          return { ...msg, reactions };
        }),
      );
    });

    return () => { offReaction(); };
  }, [roomId, user?.id]);

  // ── Context menu handlers ───────────────────────────────────────────────
  const handleLongPress = useCallback((message: Message) => {
    setSelectedMessage(message);
    setMenuVisible(true);
  }, []);

  const applyOptimisticReaction = useCallback((messageId: number, emoji: string) => {
    const userId = user?.id;
    if (!userId) return;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = [...(msg.reactions ?? [])];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0 && reactions[idx].hasReacted) {
          // Remove own reaction
          const updated = {
            ...reactions[idx],
            count: reactions[idx].count - 1,
            userIds: reactions[idx].userIds.filter((id) => id !== userId),
            hasReacted: false,
          };
          if (updated.count <= 0) reactions.splice(idx, 1);
          else reactions[idx] = updated;
        } else if (idx >= 0) {
          // Add to existing emoji
          reactions[idx] = {
            ...reactions[idx],
            count: reactions[idx].count + 1,
            userIds: [...reactions[idx].userIds, userId],
            hasReacted: true,
          };
        } else {
          // New emoji
          reactions.push({ emoji, count: 1, userIds: [userId], hasReacted: true });
        }
        return { ...msg, reactions };
      }),
    );
  }, [user?.id]);

  const handleReact = useCallback(async (emoji: string) => {
    if (!selectedMessage) return;
    setMenuVisible(false);
    applyOptimisticReaction(selectedMessage.id, emoji);
    try {
      await reactionsApi.toggle(selectedMessage.id, emoji);
    } catch { /* silent -- socket broadcast will reconcile */ }
  }, [selectedMessage, applyOptimisticReaction]);

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    setMenuVisible(false);
    setReplyTo({
      id: selectedMessage.id,
      senderHandle: selectedMessage.senderHandle ?? 'user',
      content: selectedMessage.content,
    });
  }, [selectedMessage]);

  const handleCopy = useCallback(() => {
    if (!selectedMessage?.content) return;
    Clipboard.setStringAsync(selectedMessage.content)
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch(() => {});
  }, [selectedMessage]);

  const handleReport = useCallback(() => {
    if (!selectedMessage) return;
    setMenuVisible(false);
    if (selectedMessage.senderId) {
      showReportBlockMenu(selectedMessage.senderId, selectedMessage.senderHandle ?? 'user', selectedMessage.id);
    }
  }, [selectedMessage]);

  const handleTranslate = useCallback(() => {
    if (!selectedMessage) return;
    setMenuVisible(false);
    const msgId = selectedMessage.id;
    // If already translated, toggle visibility
    if (translations[msgId]) {
      setTranslations(prev => ({
        ...prev,
        [msgId]: { ...prev[msgId], showing: !prev[msgId].showing },
      }));
      return;
    }
    // Show language picker
    setLangPickerVisible(true);
  }, [selectedMessage, translations]);

  const handleLanguageSelect = useCallback(async (language: string) => {
    if (!selectedMessage) return;
    setPreferredLanguage(language);
    AsyncStorage.setItem('preferredTranslateLanguage', language);
    const msgId = selectedMessage.id;
    try {
      const { translation } = await chat.translateMessage(msgId, language);
      setTranslations(prev => ({
        ...prev,
        [msgId]: { text: translation, showing: true },
      }));
    } catch {
      Alert.alert('Translation Error', 'Could not translate this message.');
    }
  }, [selectedMessage]);

  const handleToggleTranslation = useCallback((messageId: number) => {
    setTranslations(prev => {
      const entry = prev[messageId];
      if (!entry) return prev;
      return { ...prev, [messageId]: { ...entry, showing: !entry.showing } };
    });
  }, []);

  const handleReactionToggle = useCallback(async (messageId: number, emoji: string) => {
    applyOptimisticReaction(messageId, emoji);
    try {
      await reactionsApi.toggle(messageId, emoji);
    } catch { /* silent */ }
  }, [applyOptimisticReaction]);

  const handleImagesSelected = useCallback(async (uris: string[]) => {
    setIsUploading(true);
    try {
      const { uploads } = await requestMediaUploadUrls(uris.length);
      const results = await Promise.allSettled(
        uploads.map((upload, i) => uploadToSpaces(upload.uploadUrl, uris[i])),
      );
      const successfulUploads = uploads.filter((_, i) => results[i].status === 'fulfilled');
      if (successfulUploads.length === 0) {
        Alert.alert('Upload Failed', 'Could not upload images. Please try again.');
        return;
      }
      const keys = successfulUploads.map((u) => u.key);
      await confirmMediaUpload(keys);
      const mediaUrls = successfulUploads.map((u) => u.cdnUrl);
      const text = input.trim();
      const replyToId = replyTo?.id ?? undefined;
      sendRoomMessage(text, replyToId, mediaUrls);
      setInput('');
      setReplyTo(null);
      if (successfulUploads.length < uris.length) {
        Alert.alert('Partial Upload', `${successfulUploads.length} of ${uris.length} images uploaded.`);
      }
    } catch (err) {
      console.error('[media] Upload failed:', err);
      Alert.alert('Upload Error', 'Failed to upload images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [input, replyTo]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const replyToId = replyTo?.id ?? undefined;
    sendRoomMessage(content, replyToId);
    setInput('');
    setReplyTo(null);
  }, [input, replyTo]);

  const handleInputChange = (text: string) => {
    setInput(text);
    startTyping({ roomId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping({ roomId });
    }, 1500);
  };

  const handleBlock = useCallback((blockedUserId: number) => {
    setMessages((prev) => prev.filter((m) => m.senderId !== blockedUserId));
  }, []);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id;
    return (
      <SwipeableMessage onSwipeComplete={() => {
        setReplyTo({ id: item.id, senderHandle: item.senderHandle ?? 'user', content: item.content });
      }}>
        <MessageBubble
          message={item}
          isMe={isMe}
          onLongPress={handleLongPress}
          onReactionToggle={handleReactionToggle}
          onProfilePress={() => !isMe && item.senderHandle && router.push(`/user/${item.senderHandle}`)}
          translatedContent={translations[item.id]?.text ?? null}
          showTranslation={translations[item.id]?.showing ?? false}
          onToggleTranslation={handleToggleTranslation}
          onReplyPress={scrollToMessage}
          highlighted={item.id === highlightedId}
        />
      </SwipeableMessage>
    );
  }, [user?.id, handleLongPress, handleReactionToggle, translations, router, highlightedId, scrollToMessage]);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={keyboardBehavior}
      keyboardVerticalOffset={90}
    >
      <View style={styles.roomHeader}>
        <GlowBadge text={`${user?.timezone ?? 'UTC'} room`} color="#7A8BA8" size="sm" />
      </View>

      <FlatList
        ref={flatListRef}
        keyboardDismissMode="on-drag"
        data={messages}
        extraData={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => {
          if (!hasScrolledRef.current && messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
            hasScrolledRef.current = true;
          }
        }}
        onScrollToIndexFailed={(info) => { flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true }); }}
      />

      {typingUsers.length > 0 && (
        <TypingIndicator users={typingUsers} />
      )}

      <ReplyComposer replyTo={replyTo} onCancel={() => setReplyTo(null)} />

      <ChatInput
        value={input}
        onChangeText={handleInputChange}
        onSend={handleSend}
        isUploading={isUploading}
        onImagesSelected={handleImagesSelected}
        selection={selection}
        onSelectionChange={setSelection}
        mentionScope={user?.timezone ? 'timezone' : undefined}
        mentionContextId={user?.timezone ?? ''}
        onMentionSelect={(newText, newCursor) => {
          setInput(newText);
          setSelection({ start: newCursor, end: newCursor });
        }}
      />

      <ContextMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReact={handleReact}
        onCopy={selectedMessage?.content ? handleCopy : undefined}
        onReply={handleReply}
        onReport={handleReport}
        onTranslate={handleTranslate}
        messageContent={selectedMessage?.content ?? ''}
      />
      <LanguagePicker
        visible={langPickerVisible}
        onClose={() => setLangPickerVisible(false)}
        onSelect={handleLanguageSelect}
        selectedLanguage={preferredLanguage}
      />
    </KeyboardAvoidingView>
  );
}

// ── Typing Indicator ──────────────────────────────────────────────────────
function TypingIndicator({ users }: { users: string[] }) {
  const { colors } = useTheme();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -4, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
    animate(dot1, 0).start();
    animate(dot2, 150).start();
    animate(dot3, 300).start();
  }, []);

  return (
    <View style={styles.typingContainer}>
      <View style={[styles.typingPill, { backgroundColor: colors.surfaceGlass }]}>
        <Text style={[styles.typingText, { color: colors.textMuted }]}>
          {users.join(', ')}
        </Text>
        <View style={styles.typingDots}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[
                styles.typingDot,
                { backgroundColor: colors.textMuted, transform: [{ translateY: dot }] },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Swipeable Conversation Row ───────────────────────────────────────────
function SwipeableConversationRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const close = () => {
    isOpen.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) * 2 && Math.abs(gs.dx) > 10;
        // Allow left swipe to open, or right swipe to close when open
        return isHorizontal && (gs.dx < 0 || isOpen.current);
      },
      onPanResponderMove: (_, gs) => {
        const base = isOpen.current ? -80 : 0;
        const newVal = Math.min(0, Math.max(base + gs.dx, -80));
        translateX.setValue(newVal);
      },
      onPanResponderRelease: (_, gs) => {
        const base = isOpen.current ? -80 : 0;
        const final = base + gs.dx;
        if (final < -40) {
          isOpen.current = true;
          Animated.spring(translateX, { toValue: -80, useNativeDriver: true }).start();
        } else {
          close();
        }
      },
    })
  ).current;

  return (
    <View style={{ overflow: 'hidden' }}>
      <TouchableOpacity
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          backgroundColor: COLORS.error,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.md,
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDelete();
        }}
      >
        <Text style={{ color: '#FFF', fontFamily: FONTS.semiBold, fontSize: 14 }}>Delete</Text>
      </TouchableOpacity>
      <Animated.View
        style={{ transform: [{ translateX }], backgroundColor: colors.background }}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={() => { if (isOpen.current) close(); }}>
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── DM List Panel ─────────────────────────────────────────────────────────
function DMListPanel() {
  const { colors } = useTheme();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      chat.getConversations().then(({ conversations: convos }) => {
        setConversations(convos);
        setIsLoading(false);
      }).catch(() => setIsLoading(false));
    }, [])
  );

  // Refetch conversations when a DM arrives (handles unhide case)
  useEffect(() => {
    const offDm = onDirectMessage(() => {
      chat.getConversations().then(({ conversations: convos }) => {
        setConversations(convos);
      }).catch(() => {});
    });
    return () => { offDm(); };
  }, []);

  const handleHideConversation = useCallback(async (conversationId: number) => {
    // Optimistic UI: remove from list immediately
    setConversations((prev) => prev.filter((c) => c.conversationId !== conversationId));
    try {
      await chat.hideConversation(conversationId);
    } catch {
      // If API fails, refetch the list
      chat.getConversations().then(({ conversations: convos }) => {
        setConversations(convos);
      }).catch(() => {});
    }
  }, []);

  const handleDeleteConversation = useCallback((item: Conversation) => {
    if (item.isGroup) {
      Alert.alert('Leave Group', `Leave "${item.groupName}"? You can rejoin via invite link.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setConversations((prev) => prev.filter((c) => c.conversationId !== item.conversationId));
            try {
              await groupsApi.leave(item.conversationId);
            } catch {
              chat.getConversations().then(({ conversations: convos }) => {
                setConversations(convos);
              }).catch(() => {});
            }
          },
        },
      ]);
    } else {
      handleHideConversation(item.conversationId);
    }
  }, [handleHideConversation]);

  if (isLoading) return <LoadingState />;

  if (conversations.length === 0) {
    return (
      <View style={styles.emptyState}>
        <AnimatedEntry>
          <GlassCard>
            <View style={styles.emptyInner}>
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                <Path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke={COLORS.primary} strokeWidth={1.5} />
              </Svg>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Tap on someone's name in Local Chat to start a conversation
              </Text>
            </View>
          </GlassCard>
        </AnimatedEntry>
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.conversationId.toString()}
      contentContainerStyle={{ paddingVertical: SPACING.sm }}
      renderItem={({ item, index }) => {
        const isGroup = item.isGroup === true;
        const displayName = isGroup ? (item.groupName ?? 'Group') : `@${item.participantHandle}`;
        const avatarName = isGroup ? (item.groupName ?? 'G') : (item.participantName ?? '?');
        const avatarUrl = isGroup ? (item.groupIconUrl ?? undefined) : (item.participantAvatar ?? undefined);
        const subtitle = isGroup
          ? (item.lastMessage?.content ?? `${item.memberCount ?? 0} members`)
          : (item.lastMessage?.content ?? 'Start a conversation');

        return (
          <AnimatedEntry delay={index * 40}>
            <SwipeableConversationRow
              onDelete={() => handleDeleteConversation(item)}
            >
              <TouchableOpacity
                style={[styles.dmRow, { backgroundColor: colors.surfaceGlass }]}
                onPress={() => {
                  // Clear the unread badge locally so the UI updates before
                  // the server round-trip on return refreshes from /conversations.
                  if (item.unreadCount > 0) {
                    setConversations((prev) => prev.map((c) =>
                      c.conversationId === item.conversationId ? { ...c, unreadCount: 0 } : c,
                    ));
                  }
                  router.push({
                    pathname: '/(app)/chat/[conversationId]',
                    params: {
                      conversationId: item.conversationId.toString(),
                      handle: item.participantHandle,
                      ...(isGroup ? { isGroup: 'true', groupName: item.groupName ?? '', inviteSlug: item.inviteSlug ?? '' } : {}),
                    },
                  });
                }}
                activeOpacity={0.7}
              >
                <AvatarCircle name={avatarName} size={44} imageUrl={avatarUrl} />
                <View style={{ flex: 1 }}>
                  <View style={styles.dmRowTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={[styles.dmName, { color: colors.text }]} numberOfLines={1}>
                        {displayName}
                      </Text>
                      {isGroup && (
                        <View style={{
                          backgroundColor: COLORS.primaryGlow,
                          borderRadius: 6,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}>
                          <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.primary }}>
                            GROUP
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {item.lastMessage && (
                        <Text style={[styles.dmTime, { color: colors.textMuted }]}>
                          {formatTime(item.lastMessage.createdAt)}
                        </Text>
                      )}
                      {item.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {item.unreadCount > 99 ? '99+' : item.unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.dmPreview, { color: colors.textMuted }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
              </TouchableOpacity>
            </SwipeableConversationRow>
          </AnimatedEntry>
        );
      }}
      ListFooterComponent={<View style={{ height: tabBarSpace }} />}
    />
  );
}

// ── Shared Components ─────────────────────────────────────────────────────
function showReportBlockMenu(
  senderId: number,
  senderHandle: string,
  messageId: number,
  onBlock?: (blockedUserId: number) => void,
) {
  Alert.alert(
    `@${senderHandle}`,
    'What would you like to do?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report Message',
        onPress: () => {
          Alert.alert('Report', 'Why are you reporting this message?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Spam',
              onPress: () => moderationApi.report(senderId, 'message', 'Spam', messageId),
            },
            {
              text: 'Harassment',
              onPress: () => moderationApi.report(senderId, 'message', 'Harassment', messageId),
            },
            {
              text: 'Objectionable Content',
              onPress: () => moderationApi.report(senderId, 'message', 'Objectionable content', messageId)
                .then(() => Alert.alert('Reported', 'Thank you. We will review this within 24 hours.')),
            },
          ]);
        },
      },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Block User', `Block @${senderHandle}? You won't see their messages anymore.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: () => moderationApi.blockUser(senderId)
                .then(() => {
                  Alert.alert('Blocked', `@${senderHandle} has been blocked.`);
                  onBlock?.(senderId);
                }),
            },
          ]);
        },
      },
    ]
  );
}

function ChatInput({
  value,
  onChangeText,
  onSend,
  isUploading,
  onImagesSelected,
  selection,
  onSelectionChange,
  mentionScope,
  mentionContextId,
  onMentionSelect,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  isUploading?: boolean;
  onImagesSelected?: (uris: string[]) => void;
  selection?: { start: number; end: number };
  onSelectionChange?: (sel: { start: number; end: number }) => void;
  mentionScope?: MentionScope;
  mentionContextId?: string;
  onMentionSelect?: (newText: string, newCursor: number) => void;
}) {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const bottomPadding = keyboardVisible ? (Platform.OS === 'ios' ? 24 : 8) : tabBarSpace;

  return (
    <View style={{ position: 'relative' }}>
      {mentionScope && mentionContextId && onMentionSelect && selection && (
        <MentionAutocomplete
          text={value}
          selection={selection}
          scope={mentionScope}
          contextId={mentionContextId}
          onSelect={onMentionSelect}
        />
      )}
      <View style={[styles.inputBar, { backgroundColor: 'transparent', paddingBottom: bottomPadding }]}>
        {onImagesSelected && (
          <AttachmentButton onImagesSelected={onImagesSelected} disabled={isUploading} />
        )}
        {isUploading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />}
        <View style={[styles.inputWrap, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <MentionTextInput
            style={[styles.chatInput, { color: colors.text, fontFamily: FONTS.regular }]}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={value}
            onChangeText={onChangeText}
            selection={selection}
            onSelectionChange={onSelectionChange ? (e) => onSelectionChange(e.nativeEvent.selection) : undefined}
            multiline
            maxLength={2000}
            onSubmitEditing={onSend}
          />
        </View>
        <Pressable
          onPress={onSend}
          disabled={!value.trim() || isUploading}
          style={({ pressed }) => [{ opacity: value.trim() && !isUploading ? (pressed ? 0.8 : 1) : 0.4 }]}
        >
          <LinearGradient
            colors={[...COLORS.gradientPrimary]}
            style={styles.sendButton}
          >
            <SendIcon />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function LoadingState() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggleContainer: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  roomHeader: {
    paddingHorizontal: SPACING.page,
    paddingVertical: 6,
    alignItems: 'center',
  },
  messageList: { paddingHorizontal: 12, paddingVertical: 8 },
  typingContainer: {
    paddingHorizontal: SPACING.page,
    paddingBottom: 4,
  },
  typingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  typingText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 3,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chatInput: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderRadius: RADIUS.md,
    ...SHADOWS.sm,
  },
  dmRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dmName: { fontSize: 15, fontFamily: FONTS.semiBold },
  dmTime: { fontSize: 12, fontFamily: FONTS.regular },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: FONTS.bold,
  },
  dmPreview: { fontSize: 14, fontFamily: FONTS.regular, marginTop: 2 },
  emptyState: { flex: 1, padding: SPACING.xl, justifyContent: 'center' },
  emptyInner: { alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptySubtitle: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchInput: {
    height: 44,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  // Phase 14 polish: clear-X button overlay on search inputs
  searchInputWrapper: {
    position: 'relative',
  },
  searchInputWithClear: {
    paddingRight: 40,
  },
  searchClearButton: {
    position: 'absolute',
    right: 8,
    top: 0,
    height: 44,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 24,
    fontFamily: FONTS.regular,
    lineHeight: 26,
  },
  emptyMatches: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyMatchesText: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  chatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderRadius: RADIUS.md,
    ...SHADOWS.sm,
  },
  // Phase 14 SRCH-02: section label between Title matches / Messages sections
  searchSectionLabel: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.page,
    paddingTop: 12,
    paddingBottom: 4,
  },
  // Phase 14 SRCH-02: "Load more results" pagination button
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: SPACING.page,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  chatsRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatsRowTitle: { fontSize: 15, fontFamily: FONTS.semiBold },
  chatsRowTime: { fontSize: 12, fontFamily: FONTS.regular },
  chatsRowPreview: { fontSize: 14, fontFamily: FONTS.regular, marginTop: 2 },
  // D-11: Archived pill on group row
  archivedPill: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 2,
  },
  archivedPillText: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
  },
});
