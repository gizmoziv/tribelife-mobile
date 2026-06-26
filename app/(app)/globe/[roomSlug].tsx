import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter, useNavigation, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useKeyboardBehavior } from '@/hooks/useKeyboardBehavior';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useScrollToMessage } from '@/hooks/useScrollToMessage';
import { useAuthStore } from '@/store/authStore';
import { useGlobeStore } from '@/store/globeStore';
import { useChatsStore } from '@/store/chatsStore';
import { TIMEZONE_ZONES } from '@/utils/timezoneZones';
import { chat, globeApi, notificationsApi, reactionsApi, pins, type PinSystemMessage } from '@/services/api';
import { PinnedBar } from '@/components/ui/chat/PinnedBar';
import { usePinnedMessage } from '@/hooks/usePinnedMessage';
import { useNotificationStore } from '@/store/notificationStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguagePicker } from '@/components/ui/chat/LanguagePicker';
import {
  connectSocket,
  getSocket,
  joinGlobeRoom,
  leaveGlobeRoom,
  sendGlobeMessage,
  sendGlobeVoice,
  sendGlobeTyping,
  onGlobeMessage,
  onGlobeParticipants,
  onGlobeTyping,
  onGlobeAgeGated,
  onGlobeRateLimited,
  onMessageEdited,
  onReactionUpdate,
  onMediaRemoved,
  onMediaRejected,
  setViewing,
  clearViewing,
  globeRoomKey,
} from '@/services/socket';
import { AttachmentButton } from '@/components/ui/chat/AttachmentButton';
import { GifButton } from '@/components/ui/chat/GifButton';
import { MicButton } from '@/components/ui/chat/MicButton';
import { RecordingBar } from '@/components/ui/chat/RecordingBar';
import { requestMediaUploadUrls, uploadToSpaces, confirmMediaUpload } from '@/services/upload';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
import { EditComposer } from '@/components/ui/chat/EditComposer';
import { MentionAutocomplete } from '@/components/ui/chat/MentionAutocomplete';
import { MentionTextInput } from '@/components/ui/chat/MentionTextInput';
import { SwipeableMessage } from '@/components/ui/chat/SwipeableMessage';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import type { Message, GlobeMessage } from '@/types';
import Svg, { Path } from 'react-native-svg';

// ── Icons ───────────────────────────────────────────────────────────────────
function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="#FFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronDownIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CommunityIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Constants ───────────────────────────────────────────────────────────────
const SCROLL_THRESHOLD = 100;
const TYPING_DEBOUNCE_MS = 2000;
const TYPING_TIMEOUT_MS = 5000;
const AGE_GATE_HOURS = 24;

// Default export — reads roomSlug from Expo Router params (Chevra tab stack).
// The Chats-stack mirror at app/(app)/chat/regional/[roomSlug].tsx overrides
// backLabel="Chats" so back-pill matches the stack the user came from.
export default function GlobeRoomChat() {
  const { roomSlug, aroundMessageId: rawAroundMessageId } = useLocalSearchParams<{ roomSlug: string; aroundMessageId?: string }>();
  const aroundMessageId = rawAroundMessageId ? Number(rawAroundMessageId) : undefined;
  return <GlobeRoomScreen slug={roomSlug!} backLabel="Chevra" aroundMessageId={aroundMessageId} />;
}

// Named export — accepts slug as a prop so other tab stacks (e.g. Chats)
// can render a Globe room without crossing tab boundaries.
export function GlobeRoomScreen({ slug: roomSlug, backLabel, aroundMessageId }: { slug: string; backLabel?: string; aroundMessageId?: number }) {
  const router = useRouter();
  const keyboardBehavior = useKeyboardBehavior();
  const tabBarSpace = useTabBarSpace();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ headerShown: false });
    return () => {
      parent?.setOptions({ headerShown: true });
    };
  }, [navigation]);
  const { user, capabilities } = useAuthStore();
  const {
    rooms,
    messages,
    typingHandles,
    newMessageCount,
    isAtBottom,
    isLoadingMessages,
    hasMoreMessages,
    setActiveRoom,
    setMessages,
    addMessage,
    prependMessages,
    updateParticipantCount,
    setTyping,
    setIsAtBottom,
    resetNewMessageCount,
    setLoadingMessages,
    clearRoom,
    markRoomRead,
  } = useGlobeStore();

  const [input, setInput] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isAgeGated, setIsAgeGated] = useState(false);
  const [ageGateHours, setAgeGateHours] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<GlobeMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<GlobeMessage | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [replyTo, setReplyTo] = useState<{ id: number; senderHandle: string; content: string } | null>(null);
  const [translations, setTranslations] = useState<Record<number, { text: string; showing: boolean }>>({});
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<string>('English');
  const flatListRef = useRef<FlatList>(null);
  // Reversed copy of messages for inverted FlatList — newest message is at
  // visual bottom (index 0 of inverted list = last chronological message).
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  // Pass reversedMessages so scrollToIndex targets the correct inverted index.
  const { highlightedId, scrollToMessage } = useScrollToMessage(flatListRef, reversedMessages);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase 14 D-04: highlight flash state for tap-to-jump from search results
  const [flashHighlightedId, setFlashHighlightedId] = useState<number | undefined>(undefined);
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // Per-room dismiss of the welcome banner — persisted to AsyncStorage so it
  // stays dismissed across sessions. Per-device (not per-account).
  const welcomeDismissKey = `chevra:welcome_dismissed:${roomSlug}`;
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem('preferredTranslateLanguage').then((lang) => {
      if (lang) setPreferredLanguage(lang);
    });
  }, []);

  useEffect(() => {
    if (!roomSlug) return;
    let cancelled = false;
    AsyncStorage.getItem(welcomeDismissKey).then((v) => {
      if (!cancelled) setWelcomeDismissed(v === '1');
    });
    return () => { cancelled = true; };
  }, [roomSlug, welcomeDismissKey]);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    AsyncStorage.setItem(welcomeDismissKey, '1').catch(() => {});
  }, [welcomeDismissKey]);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      // Two-pass scroll-to-bottom: inverted list bottom = offset 0.
      // First call fires before the view shrinks; the 300ms-delayed second
      // call lands on the real post-shrink bottom (Android ~250ms).
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false }), 300);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const room = useMemo(
    () => rooms.find((r) => r.slug === roomSlug),
    [rooms, roomSlug],
  );

  // Phase 15 (TZRM-01): when `roomSlug` is a curated zone slug (e.g.
  // `eastern-time`), `globeStore.rooms` won't contain it — those only hold
  // the 7 native globe rooms. Resolve the display name + membership from
  // TIMEZONE_ZONES + chatsStore.rows so the header reads "Eastern Time"
  // (not "Globe Room") and the Join Chat button hides once joined.
  const timezoneZone = useMemo(
    () => TIMEZONE_ZONES.find((z) => z.slug === roomSlug),
    [roomSlug],
  );
  // chatsStore is the authoritative "user has joined this room" signal — a
  // row exists in /api/chats only for memberships. Use it as a fallback when
  // globeStore hasn't hydrated yet (e.g., user tapped Town Square in the
  // Chats list before ever visiting Chevra, so globeStore.rooms is empty).
  // Covers town_square, regional globe_room, and timezone_room variants.
  const isInChatsStore = useChatsStore((s) =>
    s.rows.some(
      (r) =>
        (r.type === 'town_square' && r.roomSlug === roomSlug) ||
        (r.type === 'globe_room' && r.roomSlug === roomSlug) ||
        (r.type === 'timezone_room' && r.zoneSlug === roomSlug),
    ),
  );
  const effectiveDisplayName =
    room?.displayName ?? timezoneZone?.displayName ?? 'Globe Room';

  // Phase 11 D-12: read-only mode driver. `isMember` map from Plan 11-02 D-11.
  const isMember = useGlobeStore((s) => s.isMember[roomSlug] ?? false);
  const setIsMember = useGlobeStore((s) => s.setIsMember);
  // Fall back to server-truth GlobeRoom.isMember when the store map hasn't
  // been hydrated yet (cold deep link directly to /globe/[slug]), or to the
  // chatsStore presence as the cross-room authoritative source.
  const effectiveIsMember = isMember || (room?.isMember ?? false) || isInChatsStore;

  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = useCallback(async () => {
    if (isJoining) return;
    setIsJoining(true);
    try {
      await globeApi.join(roomSlug);
      // D-11 store flip — drives the composer-appears re-render.
      setIsMember(roomSlug, true);
      // D-12: fire-and-forget — the new globe_room row appears in Chats
      // list next time the user opens the Chats tab. NO `await` here.
      // NO navigation — user stays put; composer flips on via store.
      useChatsStore.getState().hydrate();
    } catch (err: any) {
      Alert.alert("Couldn't join", err?.message ?? 'Please try again.');
    } finally {
      setIsJoining(false);
    }
  }, [roomSlug, isJoining, setIsMember]);

  const globeRoomId = `globe:${roomSlug}`;

  // ── Pinned message — load-around for jump (reuses the globe API) ──────────
  // WR-01: merge the around-window into the existing list (dedupe by id,
  // re-sort ascending) instead of wholesale replacement, so the previously
  // loaded recent tail is not discarded when jumping to an old pinned message.
  const loadAroundForPin = useCallback(async (messageId: number) => {
    setLoadingMessages(true);
    try {
      const { messages: msgs, hasMore } = await globeApi.messages(roomSlug!, undefined, 50, messageId);
      const current = useGlobeStore.getState().messages;
      const byId = new Map<number, typeof msgs[number]>();
      for (const m of current) byId.set(m.id, m);
      for (const m of msgs) byId.set(m.id, m);
      const merged = Array.from(byId.values()).sort((a, b) => a.id - b.id);
      setMessages(merged);
      if (!hasMore) prependMessages([], hasMore);
    } catch {
      // silent — bar stays visible, user can retry
    } finally {
      setLoadingMessages(false);
    }
  }, [roomSlug, setMessages, prependMessages, setLoadingMessages]);

  const { pinnedMessage, setPinnedMessage, jumpToPinned } = usePinnedMessage({
    roomId: globeRoomId,
    messages,
    flatListRef,
    loadAround: loadAroundForPin,
    scrollToMessage,
  });

  // ── Pin / unpin handlers (community room = staff only, D-07) ─────────────
  // Phase 22 (BUG-A): map the API's system message into the GlobeMessage shape
  // and append via globeStore.addMessage (dedups by id at store L68), so the
  // actor sees their own pin line immediately, deduped against the socket echo.
  const appendPinSystemMessage = useCallback(
    (systemMessage: PinSystemMessage | null) => {
      if (!systemMessage) return;
      const gm: GlobeMessage = {
        id: systemMessage.id,
        content: systemMessage.content,
        senderId: systemMessage.senderId,
        senderName: systemMessage.senderName ?? systemMessage.senderHandle,
        senderHandle: systemMessage.senderHandle,
        senderAvatar: systemMessage.senderAvatar ?? null,
        createdAt: systemMessage.createdAt,
        slug: systemMessage.slug ?? roomSlug!,
        replyToId: systemMessage.replyToId ?? null,
        replyTo: systemMessage.replyTo ?? null,
        kind: 'system',
      };
      addMessage(gm);
      // Inverted list: visual bottom = offset 0 (newest). Inline the scroll
      // rather than calling scrollToBottom (declared later — avoid TDZ in the
      // dependency array evaluated during render).
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      resetNewMessageCount();
    },
    [addMessage, resetNewMessageCount, roomSlug],
  );

  const handleGlobePin = useCallback(async (msg: GlobeMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { pin, systemMessage } = await pins.pin({ messageId: msg.id, roomId: globeRoomId });
      setPinnedMessage(pin);
      appendPinSystemMessage(systemMessage);
    } catch (err: any) {
      Alert.alert('Could not pin', err?.message ?? 'Please try again.');
    }
  }, [globeRoomId, setPinnedMessage, appendPinSystemMessage]);

  const handleGlobeUnpin = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { systemMessage } = await pins.unpin({ roomId: globeRoomId });
      setPinnedMessage(null);
      appendPinSystemMessage(systemMessage);
    } catch (err: any) {
      Alert.alert('Could not unpin', err?.message ?? 'Please try again.');
    }
  }, [globeRoomId, setPinnedMessage, appendPinSystemMessage]);

  // ── Check client-side age gate on mount ─────────────────────────────────
  useEffect(() => {
    if (user && (user as any).createdAt) {
      const createdAt = new Date((user as any).createdAt).getTime();
      const hoursSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60);
      if (hoursSinceCreation < AGE_GATE_HOURS) {
        setIsAgeGated(true);
        setAgeGateHours(Math.ceil(AGE_GATE_HOURS - hoursSinceCreation));
      }
    }
  }, [user]);

  // Re-advances the server read-position for this Globe room. Called on mount
  // (via the socket setup useEffect below) and on incoming-message-while-focused
  // (ISSUE-7 fix) to ensure live-received messages don't accrue as unread.
  const resyncReadContext = useCallback(() => {
    notificationsApi
      .readContext({ roomId: `globe:${roomSlug}` })
      .then(({ markedRead }) => {
        if (markedRead.length > 0) {
          useNotificationStore.getState().markManyRead(markedRead);
          notificationsApi.summary()
            .then((s) => useNotificationStore.getState().setSummary(s))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [roomSlug]);

  // ── Socket setup and message loading ────────────────────────────────────
  useEffect(() => {
    if (!roomSlug) return;

    setActiveRoom(roomSlug);
    setLoadingMessages(true);

    // Mark room as read on entry
    globeApi.markRead(roomSlug).catch(() => {});
    markRoomRead(roomSlug);

    // Phase 10 D-07: only Town Square is in the Chats list. Optimistic
    // clear of the Town Square row's unread + register currentlyViewing
    // so live chat:notifications don't bump while we're reading.
    if (roomSlug === 'town-square') {
      useChatsStore.getState().clearRowUnread({ type: 'town_square', roomSlug });
      useChatsStore.getState().setCurrentlyViewing('town-square');
    }
    // Phase 15 (TZRM-01): joined non-native timezone rooms also live in the
    // Chats list (materialized server-side). Same optimistic-clear pattern.
    if (timezoneZone) {
      useChatsStore.getState().clearRowUnread({ type: 'timezone_room', zoneSlug: roomSlug });
      useChatsStore.getState().setCurrentlyViewing(roomSlug);
    }

    // Clear mention notifications scoped to this Globe room so the bell +
    // summary don't keep counting an @-mention the user has now seen.
    // Refetch summary after markManyRead — Phase 14: fresh chat:notification
    // mentions don't always land in the local notifications[] array, so the
    // store's per-type summary-delta math under-decrements; the server is
    // authoritative for bell-bucket counts.
    // Also called on incoming-message-while-focused (ISSUE-7) via resyncReadContext.
    resyncReadContext();

    // Load initial messages (keep chronological order -- newest last for inverted FlatList)
    // Phase 14 D-04: pass aroundMessageId for 51-row window fetch
    globeApi
      .messages(roomSlug, undefined, 50, aroundMessageId)
      .then(({ messages: msgs, hasMore }) => {
        setMessages(msgs);
        if (!hasMore) {
          prependMessages([], hasMore);
        }
        if (aroundMessageId != null) {
          // Scroll to target message and flash it. FlatList needs a layout
          // pass before scrollToIndex can resolve; retry on failure.
          // With inverted data the visual index is reversed: chronological
          // index 0 is the visual bottom (last item), so we mirror it.
          const chronoIndex = msgs.findIndex((m) => m.id === aroundMessageId);
          if (chronoIndex >= 0) {
            const targetIndex = msgs.length - 1 - chronoIndex;
            const attemptScroll = (attempt = 0) => {
              try {
                flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false, viewPosition: 0.5 });
              } catch {
                if (attempt < 5) setTimeout(() => attemptScroll(attempt + 1), 120);
              }
            };
            setTimeout(() => attemptScroll(), 100);
            setTimeout(() => {
              setFlashHighlightedId(aroundMessageId);
              highlightAnim.setValue(1);
              Animated.timing(highlightAnim, {
                toValue: 0,
                duration: 1200,
                useNativeDriver: false,
              }).start(() => setFlashHighlightedId(undefined));
            }, 250);
          }
        }
        // No else: inverted FlatList opens at the visual bottom (offset 0)
        // natively — no timed scrollToEnd cascade needed.
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));

    // Join room via socket
    connectSocket().then(() => {
      joinGlobeRoom(roomSlug);
    });

    // 260621-un7: signal active-viewing to the backend so it suppresses
    // push/bell/unread for this room while on screen + foregrounded. All globe
    // surfaces (town-square, regional, timezone) use `globe:<roomSlug>`.
    setViewing(globeRoomKey(roomSlug));

    // Register listeners (outside .then to ensure cleanup works)
    const offMessage = onGlobeMessage((data: GlobeMessage) => {
      addMessage(data);
      // D-17: re-advance server read-position for messages from others while
      // this screen is focused so live-received messages don't accrue as unread.
      if (data.slug === roomSlug && data.senderId !== user?.id) {
        resyncReadContext();
      }
    });

    const offParticipants = onGlobeParticipants(({ slug, count }) => {
      if (slug === roomSlug) {
        updateParticipantCount(slug, count);
      }
    });

    const offTyping = onGlobeTyping(({ slug, handle, isTyping: typing }) => {
      if (slug === roomSlug && handle !== user?.handle) {
        setTyping(handle, typing);

        // Auto-clear typing after timeout
        const existing = typingClearTimers.current.get(handle);
        if (existing) clearTimeout(existing);
        if (typing) {
          typingClearTimers.current.set(
            handle,
            setTimeout(() => {
              setTyping(handle, false);
              typingClearTimers.current.delete(handle);
            }, TYPING_TIMEOUT_MS),
          );
        }
      }
    });

    const offAgeGated = onGlobeAgeGated(({ hoursRemaining }) => {
      setIsAgeGated(true);
      setAgeGateHours(Math.ceil(hoursRemaining));
    });

    const offRateLimited = onGlobeRateLimited(({ retryAfterMs }) => {
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), retryAfterMs);
    });

    const offMediaRemoved = onMediaRemoved((data) => {
      const current = useGlobeStore.getState().messages;
      setMessages(current.map((msg) => {
        if (msg.id === data.messageId) {
          return { ...msg, mediaUrls: data.remainingUrls.length > 0 ? data.remainingUrls : null };
        }
        return msg;
      }));
    });

    const offMediaRejected = onMediaRejected((data) => {
      Alert.alert('Image Removed', data.message);
    });

    const offEdited = onMessageEdited((p) => {
      const current = useGlobeStore.getState().messages;
      setMessages(current.map((m) => m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m));
    });

    // Reconnection handler
    const socket = getSocket();
    const handleReconnect = () => {
      joinGlobeRoom(roomSlug);
    };
    socket?.on('connect', handleReconnect);

    return () => {
      if (roomSlug === 'town-square') {
        const viewing = useChatsStore.getState().currentlyViewing;
        if (viewing === 'town-square') {
          useChatsStore.getState().setCurrentlyViewing(null);
        }
      }
      if (timezoneZone) {
        const viewing = useChatsStore.getState().currentlyViewing;
        if (viewing === roomSlug) {
          useChatsStore.getState().setCurrentlyViewing(null);
        }
      }
      offMessage();
      offParticipants();
      offTyping();
      offAgeGated();
      offRateLimited();
      offMediaRemoved();
      offMediaRejected();
      offEdited();
      socket?.off('connect', handleReconnect);
      leaveGlobeRoom(roomSlug);
      // 260621-un7: stop signaling active-viewing on blur so push/bell/unread
      // resume for this room.
      clearViewing();
      clearRoom();
      // Clear all typing timers
      typingClearTimers.current.forEach((timer) => clearTimeout(timer));
      typingClearTimers.current.clear();
    };
  }, [roomSlug]);

  // ── Real-time reaction updates ──────────────────────────────────────────
  useEffect(() => {
    const offReaction = onReactionUpdate((data) => {
      if (data.roomId && data.roomId !== globeRoomId) return;
      // Only process reactions that have a matching roomId for this Globe room
      if (!data.roomId) return;
      // Skip own reactions — already handled optimistically
      if (data.userId === user?.id) return;

      // Update messages in the globe store
      const current = useGlobeStore.getState().messages;
      setMessages(current.map((msg) => {
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
      }));
    });

    return () => { offReaction(); };
  }, [globeRoomId, user?.id, setMessages]);

  // ── Context menu handlers ───────────────────────────────────────────────
  const handleLongPress = useCallback((message: Message | GlobeMessage) => {
    setSelectedMessage(message as GlobeMessage);
    setMenuVisible(true);
  }, []);

  const applyOptimisticReaction = useCallback((messageId: number, emoji: string) => {
    const userId = user?.id;
    if (!userId) return;
    const current = useGlobeStore.getState().messages;
    setMessages(
      current.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = [...(msg.reactions ?? [])];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0 && reactions[idx].hasReacted) {
          const updated = {
            ...reactions[idx],
            count: reactions[idx].count - 1,
            userIds: reactions[idx].userIds.filter((id) => id !== userId),
            hasReacted: false,
          };
          if (updated.count <= 0) reactions.splice(idx, 1);
          else reactions[idx] = updated;
        } else if (idx >= 0) {
          reactions[idx] = {
            ...reactions[idx],
            count: reactions[idx].count + 1,
            userIds: [...reactions[idx].userIds, userId],
            hasReacted: true,
          };
        } else {
          reactions.push({ emoji, count: 1, userIds: [userId], hasReacted: true });
        }
        return { ...msg, reactions };
      }),
    );
  }, [user?.id, setMessages]);

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
    setMenuVisible(false);
    Alert.alert('Report', 'This message has been flagged for review.');
  }, []);

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

  // ── Scroll handling ─────────────────────────────────────────────────────
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      // Inverted list: offset 0 means at bottom (newest)
      const atBottom = contentOffset.y < SCROLL_THRESHOLD;
      setIsAtBottom(atBottom);
    },
    [setIsAtBottom],
  );

  const scrollToBottom = useCallback(() => {
    // Inverted list: visual bottom = offset 0 (newest messages).
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    resetNewMessageCount();
  }, [resetNewMessageCount]);

  // ── Load more (pagination) ──────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!hasMoreMessages || isLoadingMessages || messages.length === 0) return;

    const oldestMessage = messages[0];
    setLoadingMessages(true);
    globeApi
      .messages(roomSlug!, oldestMessage.createdAt)
      .then(({ messages: older, hasMore }) => {
        prependMessages(older.reverse(), hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [hasMoreMessages, isLoadingMessages, messages, roomSlug, prependMessages, setLoadingMessages]);

  // ── Upload + send images ─────────────────────────────────────────────────
  const handleImagesSelected = useCallback(async (uris: string[]) => {
    if (!roomSlug || isAgeGated) return;
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
      sendGlobeMessage(roomSlug, text, replyToId, mediaUrls);
      setInput('');
      setReplyTo(null);
      setIsAtBottom(true);
      resetNewMessageCount();
      // Inverted list: bottom = offset 0.
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      sendGlobeTyping(roomSlug, false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (successfulUploads.length < uris.length) {
        Alert.alert('Partial Upload', `${successfulUploads.length} of ${uris.length} images uploaded.`);
      }
    } catch (err) {
      console.error('[media] Upload failed:', err);
      Alert.alert('Upload Error', 'Failed to upload images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [input, roomSlug, isAgeGated, replyTo]);

  // GIF tap-to-send: a Giphy selection sends IMMEDIATELY as its own media-only
  // message (empty content + the Giphy CDN URL in mediaUrls). Mirrors the photo
  // send shape (sendGlobeMessage with mediaUrls) — relies on server broadcast,
  // no optimistic insert, like photos here. Respects the same age-gate guard.
  const handleGifSelected = useCallback((gifUrl: string) => {
    if (!roomSlug || isAgeGated) return;
    const replyToId = replyTo?.id ?? undefined;
    sendGlobeMessage(roomSlug, '', replyToId, [gifUrl]);
    setReplyTo(null);
    setIsAtBottom(true);
    resetNewMessageCount();
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  }, [roomSlug, isAgeGated, replyTo]);

  // ── Send message ────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || !roomSlug || isAgeGated || isRateLimited) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const replyToId = replyTo?.id ?? undefined;
    sendGlobeMessage(roomSlug, content, replyToId);
    setInput('');
    setReplyTo(null);
    // Auto-scroll to bottom after sending (inverted: bottom = offset 0).
    setIsAtBottom(true);
    resetNewMessageCount();
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    // Stop typing
    sendGlobeTyping(roomSlug, false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [input, roomSlug, isAgeGated, isRateLimited, replyTo]);

  // Voice send mirrors the photo flow (D-01): no optimistic bubble — the bubble
  // arrives on the globe:message echo. Passes the route/curated slug (NOT the
  // timezone roomId — Pitfall 8). RecordingBar owns its own upload spinner.
  const handleSendVoice = useCallback((cdnUrl: string, durationMs: number, waveform: number[]) => {
    if (!roomSlug) return;
    sendGlobeVoice(roomSlug, cdnUrl, durationMs, waveform, replyTo?.id ?? undefined);
    setReplyTo(null);
    setIsRecording(false);
    setIsAtBottom(true);
    resetNewMessageCount();
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  }, [roomSlug, replyTo]);

  // ── Typing indicator ────────────────────────────────────────────────────
  const handleInputChange = useCallback(
    (text: string) => {
      setInput(text);
      if (!roomSlug || isAgeGated) return;

      sendGlobeTyping(roomSlug, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendGlobeTyping(roomSlug, false);
      }, TYPING_DEBOUNCE_MS);
    },
    [roomSlug, isAgeGated],
  );

  // ── Render message ──────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }: { item: GlobeMessage }) => {
      const isMe = item.senderId === user?.id;
      const isFlash = item.id === flashHighlightedId;
      const bubble = (
        <SwipeableMessage
          enabled={effectiveIsMember}
          onSwipeComplete={() => {
            setReplyTo({ id: item.id, senderHandle: item.senderHandle ?? 'user', content: item.content });
          }}
        >
          <MessageBubble
            message={item}
            isMe={isMe}
            onLongPress={effectiveIsMember ? handleLongPress : () => {}}
            onReactionToggle={handleReactionToggle}
            onProfilePress={effectiveIsMember ? () => !isMe && item.senderHandle && router.push(`/user/${item.senderHandle}`) : () => {}}
            translatedContent={translations[item.id]?.text ?? null}
            showTranslation={translations[item.id]?.showing ?? false}
            onToggleTranslation={handleToggleTranslation}
            onReplyPress={scrollToMessage}
            highlighted={item.id === highlightedId}
          />
        </SwipeableMessage>
      );
      if (isFlash) {
        return (
          <Animated.View
            style={{
              backgroundColor: highlightAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [colors.background, colors.accentSoft ?? colors.primaryGlow],
              }),
            }}
          >
            {bubble}
          </Animated.View>
        );
      }
      return bubble;
    },
    [user?.id, flashHighlightedId, effectiveIsMember, handleLongPress, handleReactionToggle, translations, router, highlightedId, scrollToMessage, highlightAnim, colors],
  );

  // ── Typing indicator display ────────────────────────────────────────────
  const typingArray = useMemo(() => Array.from(typingHandles), [typingHandles]);
  const typingText = useMemo(() => {
    if (typingArray.length === 0) return null;
    if (typingArray.length === 1) return `${typingArray[0]} is typing...`;
    if (typingArray.length <= 3) return `${typingArray.join(', ')} are typing...`;
    return `${typingArray.length} people typing...`;
  }, [typingArray]);

  // ── Participant count from room ─────────────────────────────────────────
  const participantCount = room?.participantCount ?? 0;

  if (isLoadingMessages && messages.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <CustomHeader
          title={effectiveDisplayName}
          participantCount={0}
          onBack={() => router.back()}
          colors={colors}
          insetsTop={insets.top}
          backLabel={backLabel}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <CustomHeader
        title={effectiveDisplayName}
        participantCount={participantCount}
        onBack={() => router.back()}
        colors={colors}
        insetsTop={insets.top}
        backLabel={backLabel}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={0}
      >
        {/* Age gate banner */}
        {isAgeGated && (
          <View style={[styles.ageGateBanner, { backgroundColor: colors.surfaceGlass }]}>
            <Text style={[styles.ageGateText, { color: COLORS.warning }]}>
              New accounts can post after {AGE_GATE_HOURS} hours. You can post in {ageGateHours} hour{ageGateHours !== 1 ? 's' : ''}.
            </Text>
          </View>
        )}

        {/* Welcome message — dismissible per room (persisted to AsyncStorage) */}
        {room?.welcomeMessage && !welcomeDismissed && (
          <View style={[styles.welcomeBanner, { backgroundColor: colors.primaryGlow }]}>
            <TouchableOpacity
              onPress={dismissWelcome}
              hitSlop={10}
              style={styles.welcomeDismiss}
              accessibilityLabel="Dismiss welcome message"
            >
              <Text style={[styles.welcomeDismissText, { color: COLORS.primary }]}>✕</Text>
            </TouchableOpacity>
            <View style={styles.welcomeRow}>
              <CommunityIcon color={COLORS.primary} />
              <Text style={[styles.welcomeTitle, { color: COLORS.primary }]}>
                {room.displayName}
              </Text>
            </View>
            <Text style={[styles.welcomeText, { color: colors.text }]}>
              {room.welcomeMessage}
            </Text>
          </View>
        )}

        {/* Pinned bar — sticky above message stream (D-11), visible to everyone */}
        {pinnedMessage && (
          <PinnedBar
            pin={pinnedMessage}
            canUnpin={capabilities?.isStaff === true}
            onTap={jumpToPinned}
            onUnpin={handleGlobeUnpin}
          />
        )}

        {/* Message list */}
        {/* inverted: newest message anchors at visual bottom (offset 0).
            Data is reversed so index 0 = most-recent message; the native
            inverted prop flips rendering so it appears at the bottom.
            No timed scrollToEnd cascade or onContentSizeChange re-snap
            needed — the inverted layout handles initial positioning. */}
        <FlatList
          ref={flatListRef}
          inverted
          keyboardDismissMode="on-drag"
          data={reversedMessages}
          // Include effectiveIsMember so post-Join the membership-gated props
          // on SwipeableMessage + MessageBubble (long-press, profile press)
          // re-bind without needing a navigation cycle.
          extraData={[reversedMessages, effectiveIsMember]}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onScrollToIndexFailed={(info) => {
            // Approximate scroll first to bring the target into the
            // render window, then re-attempt scrollToIndex for precise centering.
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 });
              } catch { /* silent */ }
            }, 200);
          }}
          onEndReachedThreshold={0.3}
          maxToRenderPerBatch={15}
          windowSize={10}
          ListFooterComponent={
            isLoadingMessages && messages.length > 0 ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
            ) : null
          }
        />

        {/* Scroll-to-bottom pill */}
        {!isAtBottom && newMessageCount > 0 && (
          <Pressable onPress={scrollToBottom} style={styles.scrollPillWrapper}>
            <View style={[styles.scrollPill, { backgroundColor: COLORS.primary }, SHADOWS.md]}>
              <ChevronDownIcon color="#FFF" />
              <Text style={styles.scrollPillText}>
                {newMessageCount} new message{newMessageCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Typing indicator */}
        {typingText && (
          <View style={styles.typingContainer}>
            <View style={[styles.typingPill, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.typingDisplayText, { color: colors.textMuted }]}>
                {typingText}
              </Text>
            </View>
          </View>
        )}

        {/* Phase 11 D-12: composer hidden in read-only mode; replaced by Join CTA. */}
        {effectiveIsMember ? (
          <>
            {/* Edit composer — shown when editing an own message */}
            {editingMessage && (
              <EditComposer
                initialContent={editingMessage.content}
                saving={savingEdit}
                onCancel={() => setEditingMessage(null)}
                onSave={async (newContent) => {
                  if (!editingMessage) return;
                  setSavingEdit(true);
                  try {
                    const { message: updated } = await chat.editMessage(editingMessage.id, newContent);
                    const current = useGlobeStore.getState().messages;
                    setMessages(current.map((m) => m.id === updated.id ? { ...m, content: updated.content, editedAt: updated.editedAt } : m));
                    setEditingMessage(null);
                  } catch (err: any) {
                    Alert.alert('Edit Failed', err?.message ?? 'Could not save edit. Please try again.');
                  } finally {
                    setSavingEdit(false);
                  }
                }}
              />
            )}

            {/* Reply composer */}
            <ReplyComposer replyTo={replyTo} onCancel={() => setReplyTo(null)} />

            {/* Chat input */}
            <View style={{ position: 'relative' }}>
              <MentionAutocomplete
                text={input}
                selection={selection}
                scope={timezoneZone ? 'timezone' : 'globe'}
                contextId={timezoneZone ? (timezoneZone.members[0] ?? roomSlug) : roomSlug}
                onSelect={(newText, newCursor) => {
                  setInput(newText);
                  setSelection({ start: newCursor, end: newCursor });
                }}
              />
              <View style={[styles.inputBar, { backgroundColor: 'transparent', paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 24 : 8) : tabBarSpace }]}>
                {isRecording ? (
                  // Recording surface (D-06): replace the input row in place,
                  // preserving the inputBar padding/keyboard-aware bottom.
                  <RecordingBar
                    onDiscard={() => setIsRecording(false)}
                    onSent={handleSendVoice}
                  />
                ) : (
                  <>
                    {!isAgeGated && (
                      <AttachmentButton onImagesSelected={handleImagesSelected} disabled={isUploading} />
                    )}
                    {!isAgeGated && (
                      <GifButton onGifSelected={handleGifSelected} disabled={isUploading} />
                    )}
                    {isUploading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />}
                    <View
                      style={[
                        styles.inputWrap,
                        {
                          backgroundColor: colors.surfaceGlass,
                          borderColor: colors.border,
                          opacity: isAgeGated ? 0.5 : 1,
                        },
                      ]}
                    >
                      <MentionTextInput
                        style={[styles.chatInput, { color: colors.text, fontFamily: FONTS.regular }]}
                        placeholder={
                          isAgeGated
                            ? `You can post in ${ageGateHours} hour${ageGateHours !== 1 ? 's' : ''}`
                            : 'Message...'
                        }
                        placeholderTextColor={colors.textMuted}
                        value={input}
                        onChangeText={handleInputChange}
                        selection={selection}
                        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                        editable={!isAgeGated}
                        multiline
                        maxLength={2000}
                        onSubmitEditing={handleSend}
                      />
                    </View>
                    {/* Send-slot swap (VOICE-01): mic on empty input, send
                        otherwise — never both. Mic is gated behind the same
                        age/rate guards as text. */}
                    {!input.trim() && !isAgeGated && !isRateLimited && !isUploading ? (
                      <MicButton onPress={() => setIsRecording(true)} />
                    ) : (
                      <Pressable
                        onPress={handleSend}
                        disabled={!input.trim() || isAgeGated || isRateLimited || isUploading}
                        style={({ pressed }) => [
                          { opacity: input.trim() && !isAgeGated && !isRateLimited && !isUploading ? (pressed ? 0.8 : 1) : 0.4 },
                        ]}
                      >
                        <LinearGradient
                          colors={[...COLORS.gradientPrimary]}
                          style={styles.sendButton}
                        >
                          <SendIcon />
                        </LinearGradient>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.joinChatBar, { paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 24 : 8) : tabBarSpace }]}>
            <TouchableOpacity
              style={[styles.joinChatButton, { backgroundColor: COLORS.primary, opacity: isJoining ? 0.6 : 1 }]}
              onPress={handleJoin}
              disabled={isJoining}
              activeOpacity={0.85}
            >
              {isJoining ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.joinChatButtonText}>Join Chat</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Context menu */}
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          onReact={handleReact}
          onCopy={selectedMessage?.content ? handleCopy : undefined}
          onReply={handleReply}
          onReport={handleReport}
          onTranslate={handleTranslate}
          isOwn={!!user && selectedMessage?.senderId === user.id}
          onEdit={selectedMessage && !!user && selectedMessage.senderId === user.id
            ? () => { setEditingMessage(selectedMessage); }
            : undefined}
          onPin={
            capabilities?.isStaff === true &&
            selectedMessage?.kind !== 'system' &&
            pinnedMessage?.messageId !== selectedMessage?.id
              ? () => selectedMessage && handleGlobePin(selectedMessage)
              : undefined
          }
          onUnpin={
            capabilities?.isStaff === true &&
            pinnedMessage?.messageId === selectedMessage?.id
              ? handleGlobeUnpin
              : undefined
          }
          messageContent={selectedMessage?.content ?? ''}
        />
        <LanguagePicker
          visible={langPickerVisible}
          onClose={() => setLangPickerVisible(false)}
          onSelect={handleLanguageSelect}
          selectedLanguage={preferredLanguage}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Custom header ────────────────────────────────────────────────────────────
interface CustomHeaderProps {
  title: string;
  participantCount: number;
  onBack: () => void;
  colors: { background: string; surfaceGlass: string; text: string; textMuted: string };
  insetsTop: number;
  backLabel?: string;
}

function CustomHeader({ title, participantCount, onBack, colors, insetsTop, backLabel = 'Chevra' }: CustomHeaderProps) {
  return (
    <View
      style={[
        styles.headerRow,
        {
          paddingTop: (Platform.OS === 'android' ? insetsTop : 0) + 6,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [
          styles.headerBackPill,
          { backgroundColor: colors.surfaceGlass, opacity: pressed ? 0.8 : 1 },
          SHADOWS.sm,
        ]}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={[styles.headerBackText, { color: colors.text }]}>{backLabel}</Text>
      </Pressable>
      <View style={styles.headerTitleWrap} pointerEvents="none">
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      </View>
      <View style={[styles.headerParticipants, { backgroundColor: colors.surfaceGlass }, SHADOWS.sm]}>
        <View style={[styles.participantDot, { backgroundColor: COLORS.secondary }]} />
        <Text style={[styles.participantText, { color: colors.textMuted }]}>{participantCount}</Text>
      </View>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.page,
    paddingBottom: 10,
  },
  headerBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  headerBackText: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  headerTitleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
  headerParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  participantDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  participantText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  // Welcome banner
  welcomeBanner: {
    marginHorizontal: SPACING.page,
    marginTop: SPACING.sm,
    padding: 12,
    paddingRight: 36,
    borderRadius: RADIUS.sm,
    position: 'relative',
  },
  welcomeDismiss: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeDismissText: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    lineHeight: 18,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  welcomeText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 18,
  },
  // Age gate banner
  ageGateBanner: {
    marginHorizontal: SPACING.page,
    marginTop: SPACING.sm,
    padding: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  ageGateText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    textAlign: 'center',
  },
  // Messages
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // Scroll-to-bottom pill
  scrollPillWrapper: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    zIndex: 10,
  },
  scrollPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
  },
  scrollPillText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  // Typing indicator
  typingContainer: {
    paddingHorizontal: SPACING.page,
    paddingBottom: 4,
  },
  typingPill: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typingDisplayText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    // Moderate radius (not RADIUS.pill): ~half the single-line height so it
    // still looks pill-like when short, but becomes a clean rounded rectangle
    // when multiline text grows the box — a full pill clips wrapped text.
    borderRadius: RADIUS.md,
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
    // Match iOS: drop Android's Material elevation (squarish halo behind the
    // circular send button on Android). Same idiom as the chat-card fix.
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  // Phase 11 D-12: join CTA bar replacing the composer for non-members.
  joinChatBar: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  joinChatButton: {
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  joinChatButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
});
