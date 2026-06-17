import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Keyboard,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  Pressable,
  AppState,
  Animated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useKeyboardBehavior } from '@/hooks/useKeyboardBehavior';
import { useScrollToMessage } from '@/hooks/useScrollToMessage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useNavigation, useRouter, usePathname, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import { chat, moderationApi, reactionsApi, notificationsApi, groupsApi, pins } from '@/services/api';
import { PinnedBar } from '@/components/ui/chat/PinnedBar';
import { usePinnedMessage } from '@/hooks/usePinnedMessage';
import { useNotificationStore } from '@/store/notificationStore';
import { useChatsStore } from '@/store/chatsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguagePicker } from '@/components/ui/chat/LanguagePicker';
import {
  joinConversation,
  leaveConversation,
  sendDirectMessage,
  onDirectMessage,
  startTyping,
  stopTyping,
  onTypingStart,
  onTypingStop,
  onMessageRejected,
  onMessageEdited,
  onReactionUpdate,
  onMediaRemoved,
  onChatRemoved,
  onMediaRejected,
  getSocket,
} from '@/services/socket';
import { AttachmentButton } from '@/components/ui/chat/AttachmentButton';
import { requestMediaUploadUrls, uploadToSpaces, confirmMediaUpload } from '@/services/upload';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
import { EditComposer } from '@/components/ui/chat/EditComposer';
import { MentionAutocomplete } from '@/components/ui/chat/MentionAutocomplete';
import { MentionTextInput } from '@/components/ui/chat/MentionTextInput';
import { SwipeableMessage } from '@/components/ui/chat/SwipeableMessage';
import type { Message } from '@/types';
import Svg, { Path } from 'react-native-svg';

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function DMThreadScreen() {
  const { conversationId: rawId, handle, isGroup: rawIsGroup, groupName: rawGroupName, inviteSlug: rawInviteSlug, isMember: rawIsMember, isArchived: rawIsArchived, aroundMessageId: rawAroundMessageId } = useLocalSearchParams<{
    conversationId: string;
    handle?: string;
    isGroup?: string;
    groupName?: string;
    inviteSlug?: string;
    isMember?: string;
    isArchived?: string;
    aroundMessageId?: string;
  }>();
  // Phase 14 D-04: tap-to-jump from search results
  const aroundMessageId = rawAroundMessageId ? Number(rawAroundMessageId) : undefined;
  const conversationId = parseInt(rawId);
  const isGroup = rawIsGroup === 'true';
  const groupName = rawGroupName ?? '';
  const inviteSlug = rawInviteSlug ?? '';
  // D-11: archived groups render a read-only archived bar instead of the composer.
  const isArchived = rawIsArchived === 'true';
  // D-09: default to member when the flag is absent — preserves existing Chats-list tap behavior.
  const initialIsMember = rawIsMember !== 'false';
  const navigation = useNavigation();
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const keyboardBehavior = useKeyboardBehavior();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Inline-header DM title resolution: when the DM is opened without a `handle`
  // param (e.g. from a notification tap), the other participant's handle is
  // discovered asynchronously from the first loaded message. Hold it in state
  // so the inline header title re-renders reactively (mirrors how the old
  // native-header path called navigation.setOptions after the load).
  const [resolvedHandle, setResolvedHandle] = useState<string | null>(null);
  // ── D-09: Preview-to-join state (mirrors v1.7 Phase 11 D-12 pattern) ───────
  const [isMember, setIsMember] = useState<boolean>(initialIsMember);
  const [isJoining, setIsJoining] = useState<boolean>(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      // Match WhatsApp/iMessage: when the keyboard rises, snap the message
      // list to the bottom so the latest messages stay visible above the
      // keyboard instead of being pushed under it.
      //
      // Inverted list: the visual bottom (newest) is offset 0.
      // Two-pass scroll handles Android's `behavior='height'` KAV: the
      // first call fires before the view finishes shrinking, and the second
      // call after a tick lands on the real post-shrink bottom. iOS settles
      // synchronously, but the double call is harmless there.
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      // Android keyboard animation is ~250ms; fire the snap pass at 300ms
      // so it lands AFTER the post-shrink layout has settled.
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: false }), 300);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Tell the push-notification handler which chat we're on so it can suppress
  // foreground OS banners only for this conversation. Pushes for OTHER chats
  // still surface normally.
  useEffect(() => {
    const setContext = useForegroundContextStore.getState().setContext;
    setContext({ type: 'chat', conversationId });
    return () => setContext({ type: 'none' });
  }, [conversationId]);
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [replyTo, setReplyTo] = useState<{ id: number; senderHandle: string; content: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [translations, setTranslations] = useState<Record<number, { text: string; showing: boolean }>>({});
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<string>('English');
  // Phase 22: the current user's role in a group (D-02).
  // Fetched on mount for group conversations so we can gate Pin/Unpin
  // via myGroupRole only (D-05 — staff flag must NOT be the authority
  // in DM/group screens; only globe + local chat rooms use it).
  const [myGroupRole, setMyGroupRole] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  // Reversed copy for the inverted FlatList — index 0 = newest message =
  // visual bottom. Inverting fixes the composer floating mid-screen after the
  // keyboard collapses + the message jitter: the list opens at the bottom
  // natively, so the old timed scrollToEnd cascade + onContentSizeChange
  // re-snap loop (which fought FlatList's windowed layout) are removed. Same
  // fix already shipped for Globe (ISSUE-8) and the timezone room (chat/local).
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  // Pass reversedMessages so scrollToIndex (in useScrollToMessage) targets the
  // correct inverted visual index — mirrors globe/[roomSlug].tsx + chat/local.tsx.
  const { highlightedId, scrollToMessage } = useScrollToMessage(flatListRef, reversedMessages);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase 14 D-04: highlight flash state for tap-to-jump from search results
  const [flashHighlightedId, setFlashHighlightedId] = useState<number | undefined>(undefined);
  const highlightAnim = useRef(new Animated.Value(0)).current;
  // Older-message pagination (load-on-scroll-to-top). With the inverted list,
  // onEndReached fires at the visual TOP and fetches messages older than the
  // oldest currently-loaded one (keyset `before=<ISO>` cursor on the existing
  // conversation messages API). Mirrors chat/local.tsx.
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('preferredTranslateLanguage').then((lang) => {
      if (lang) setPreferredLanguage(lang);
    });
  }, []);

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ headerShown: false });
    return () => {
      parent?.setOptions({ headerShown: true });
    };
  }, [navigation]);

  // Inline-header back control — preserves the prior native-header goBack:
  // pop the stack if possible, else replace into the Chats list root.
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/chat');
    }
  }, [router]);

  // ── Inline-header title (replaces the native-header navigation.setOptions) ──
  // Group: groupName (+ "[Archived]" suffix when archived).
  // DM: "@<handle> & You", where <handle> comes from the route param or, on the
  // notification-tap path where no handle param exists, the async-resolved
  // other-participant handle (set in the message-load effect below).
  const headerTitle = useMemo(() => {
    if (isGroup && groupName) {
      return isArchived ? `${groupName} [Archived]` : groupName;
    }
    const dmHandle = handle ?? resolvedHandle;
    if (dmHandle) return `@${dmHandle} & You`;
    return '';
  }, [isGroup, groupName, isArchived, handle, resolvedHandle]);

  // ── Inline-header right-side menu (replaces the native headerRight) ──────────
  // Group: 3-dot (vertical) → open the group info/management screen.
  // DM: 3-dot (horizontal) → Report / Block action sheet for the other user.
  const handleGroupMenu = useCallback(() => {
    router.push({
      pathname: '/(app)/group/[conversationId]',
      params: { conversationId: conversationId.toString(), groupName, inviteSlug, from: pathname },
    });
  }, [router, conversationId, groupName, inviteSlug, pathname]);

  const handleDmMenu = useCallback(() => {
    const otherMsg = messages.find((m) => m.senderId !== user?.id);
    const otherUserId = otherMsg?.senderId;
    const otherHandle = handle ?? otherMsg?.senderHandle ?? 'user';
    if (!otherUserId) return;
    Alert.alert(`@${otherHandle}`, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report User',
        onPress: () => {
          moderationApi.report(otherUserId, 'profile', 'Reported from DM conversation')
            .then(() => Alert.alert('Reported', 'Thank you. We will review this within 24 hours.'));
        },
      },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Block User', `Block @${otherHandle}? You won't see their messages anymore.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: () => {
                moderationApi.blockUser(otherUserId)
                  .then(() => {
                    Alert.alert('Blocked', `@${otherHandle} has been blocked.`);
                    router.back();
                  });
              },
            },
          ]);
        },
      },
    ]);
  }, [messages, handle, user?.id, router]);

  // DM menu is only actionable once we know the other participant. Mirrors the
  // old native-header behavior where headerRight was only set after otherUserId
  // resolved — here we simply hide the button until then.
  const dmMenuReady = useMemo(
    () => !isGroup && messages.some((m) => m.senderId !== user?.id),
    [isGroup, messages, user?.id],
  );

  // Opening a chat directly (not via a notification tap) should still clear
  // any bell notifications tied to this conversation — otherwise the badge
  // keeps claiming the user has unread notifications for messages they've
  // now seen. Server authoritatively marks them read; the local store
  // update below keeps the bell count in sync without a refetch.
  // Also called on incoming-message-while-focused (ISSUE-7) to advance the
  // server read-position so live-received messages don't accrue as unread.
  const resyncReadContext = useCallback(() => {
    if (Number.isNaN(conversationId)) return;
    notificationsApi.readContext({ conversationId })
      .then(({ markedRead }) => {
        if (markedRead.length > 0) {
          useNotificationStore.getState().markManyRead(markedRead);
          // Phase 14: refetch summary — fresh chat:notification mentions
          // aren't always in the local notifications[] array, so the
          // store's per-type bucket math under-decrements. Server truth.
          notificationsApi.summary()
            .then((s) => useNotificationStore.getState().setSummary(s))
            .catch(() => {});
        }
      })
      .catch(() => { /* silent — bell will recover on next list refetch */ });
  }, [conversationId]);

  useEffect(() => {
    resyncReadContext();
  }, [resyncReadContext]);

  // Phase 22 D-02: fetch the caller's role in this group so we can gate
  // Pin/Unpin via role alone (D-05 — staff flag not used in this screen).
  useEffect(() => {
    if (!isGroup || !user?.id) return;
    let cancelled = false;
    groupsApi.members(conversationId).then(({ members }) => {
      if (cancelled) return;
      const me = members.find((m) => m.userId === user.id);
      setMyGroupRole(me?.role ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [conversationId, isGroup, user?.id]);

  // Phase 22: load-around for jump-to-pin (reuses chat.getConversationMessages)
  const loadAroundForPin = useCallback(async (messageId: number) => {
    try {
      const { messages: msgs } = await chat.getConversationMessages(conversationId, { aroundMessageId: messageId });
      setMessages(msgs);
    } catch {
      // silent — bar stays visible
    }
  }, [conversationId]);

  const { pinnedMessage, setPinnedMessage, jumpToPinned } = usePinnedMessage({
    conversationId,
    messages,
    flatListRef,
    loadAround: loadAroundForPin,
    scrollToMessage,
  });

  // Phase 22 D-02/D-04: pin/unpin handlers — authority per surface.
  // DM: either participant (no role check needed).
  // Group: only admin (myGroupRole === 'admin').
  // D-05: community-room-only flag must NOT gate pin in DM/group screens.
  const handleDmPin = useCallback(async (msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { pin, systemMessage } = await pins.pin({ messageId: msg.id, conversationId });
      setPinnedMessage(pin);
      // Phase 22 (BUG-A): append the actor's own pin system line immediately
      // (deduped by id against the dm:message socket echo via the same guard
      // used in onDirectMessage) so the pinner sees it without leaving+re-entering.
      if (systemMessage) {
        setMessages((prev) => (prev.some((m) => m.id === systemMessage.id) ? prev : [...prev, systemMessage]));
        // Inverted list: visual bottom = offset 0 (newest message).
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    } catch (err: any) {
      Alert.alert('Could not pin', err?.message ?? 'Please try again.');
    }
  }, [conversationId, setPinnedMessage]);

  const handleDmUnpin = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { systemMessage } = await pins.unpin({ conversationId });
      setPinnedMessage(null);
      if (systemMessage) {
        setMessages((prev) => (prev.some((m) => m.id === systemMessage.id) ? prev : [...prev, systemMessage]));
        // Inverted list: visual bottom = offset 0 (newest message).
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    } catch (err: any) {
      Alert.alert('Could not unpin', err?.message ?? 'Please try again.');
    }
  }, [conversationId, setPinnedMessage]);

  // Phase 10 D-07: optimistic clear of the matching Chats row's unread +
  // register this screen as currently-viewing (suppresses bump on incoming
  // chat:notification for this conversation).
  useEffect(() => {
    if (!Number.isFinite(conversationId)) return;
    const rowType: 'dm' | 'group' = isGroup ? 'group' : 'dm';
    useChatsStore.getState().clearRowUnread({ type: rowType, conversationId });
    useChatsStore.getState().setCurrentlyViewing(conversationId);
    return () => {
      const viewing = useChatsStore.getState().currentlyViewing;
      if (viewing === conversationId) {
        useChatsStore.getState().setCurrentlyViewing(null);
      }
    };
  }, [conversationId, isGroup]);

  useEffect(() => {
    // Phase 14 D-04: pass aroundMessageId for 51-row window fetch
    chat.getConversationMessages(conversationId, aroundMessageId != null ? { aroundMessageId } : undefined).then(({ messages: msgs, hasMore: more }) => {
      setMessages(msgs);
      setHasMore(more ?? true);
      setIsLoading(false);
      if (!isGroup && !handle && msgs.length > 0) {
        const otherMsg = msgs.find((m) => m.senderId !== user?.id);
        if (otherMsg?.senderHandle) {
          // Drive the inline-header title reactively (was navigation.setOptions
          // on the native header). headerTitle useMemo picks this up.
          setResolvedHandle(otherMsg.senderHandle);
        }
      }
      if (aroundMessageId != null) {
        // Scroll to target message and flash it. FlatList needs a layout
        // pass before scrollToIndex can resolve; retry on failure. With the
        // inverted list the visual index is mirrored: chronological index i
        // maps to reversed/inverted index (length - 1 - i).
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
      // No else: the inverted FlatList opens at the visual bottom (offset 0)
      // natively — no timed scrollToEnd cascade needed (that cascade fighting
      // windowed layout was the jitter source; same fix as globe/local).
    }).catch(() => setIsLoading(false));

    joinConversation(conversationId);

    const offDm = onDirectMessage((msg) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        // Replace optimistic message (negative ID) from same sender with real one
        const hasOptimistic = prev.some((m) => m.id < 0 && m.senderId === msg.senderId && m.content === msg.content);
        if (hasOptimistic) {
          return prev.map((m) =>
            m.id < 0 && m.senderId === msg.senderId && m.content === msg.content ? msg : m
          );
        }
        return [...prev, msg];
      });
      // Inverted list: visual bottom = offset 0 (newest message).
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      // D-17: re-advance server read-position for messages from others while
      // this screen is focused so live-received messages don't accrue as unread.
      if (msg.senderId !== user?.id) {
        resyncReadContext();
      }
    });

    // Auto-clear the typing indicator 5s after the last typing:start — guards
    // against a missed typing:stop (e.g. when the app was backgrounded and the
    // socket dropped before the other user stopped typing).
    const TYPING_TIMEOUT_MS = 5000;
    const clearTypingLater = () => {
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
      typingClearTimerRef.current = setTimeout(() => {
        setIsTyping(false);
        typingClearTimerRef.current = null;
      }, TYPING_TIMEOUT_MS);
    };

    const offTypingStart = onTypingStart(({ handle: h }) => {
      if (h !== user?.handle) {
        setIsTyping(true);
        clearTypingLater();
      }
    });

    const offTypingStop = onTypingStop(() => {
      setIsTyping(false);
      if (typingClearTimerRef.current) {
        clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = null;
      }
    });

    const offRejected = onMessageRejected(({ reason }) => {
      Alert.alert(
        'Message Not Sent',
        reason ?? 'Your message was rejected. It may violate community guidelines.',
      );
    });

    const offEdited = onMessageEdited((p) => {
      setMessages((prev) => prev.map((m) => m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m));
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

    // Phase 12: server tells us we were removed (e.g. admin kick). If the
    // event targets this open conversation, eject back to the Chats list.
    // Global hydrate of the chats list happens in (app)/_layout.tsx — this
    // listener only handles the in-screen UX.
    const offChatRemoved = onChatRemoved((data) => {
      if (data.conversationId !== conversationId) return;
      Alert.alert(
        'Removed from group',
        'An admin removed you from this conversation.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (router.canGoBack()) router.back();
              else router.replace('/(app)/chat');
            },
          },
        ],
      );
    });

    return () => {
      leaveConversation(conversationId);
      offDm();
      offTypingStart();
      offTypingStop();
      offRejected();
      offEdited();
      offMediaRemoved();
      offMediaRejected();
      offChatRemoved();
      if (typingClearTimerRef.current) {
        clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = null;
      }
    };
  }, [conversationId]);

  // Recover from socket drops and OS-killed sockets while backgrounded:
  // on foreground + on socket reconnect, re-fetch the conversation's messages
  // (any sent while we were offline would otherwise be invisible) and re-join
  // the conversation room on the server.
  useEffect(() => {
    const refetchAndRejoin = async () => {
      setIsTyping(false);
      if (typingClearTimerRef.current) {
        clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = null;
      }
      try {
        const { messages: fresh } = await chat.getConversationMessages(conversationId);
        setMessages((prev) => {
          const pending = prev.filter((m) => m.id < 0); // preserve optimistic
          return [...fresh, ...pending];
        });
      } catch { /* silent — next user action will surface the error */ }
      joinConversation(conversationId);
    };

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchAndRejoin();
    });
    const socket = getSocket();
    const onConnect = () => refetchAndRejoin();
    socket?.on('connect', onConnect);

    return () => {
      appSub.remove();
      socket?.off('connect', onConnect);
    };
  }, [conversationId]);

  // ── Real-time reaction updates ──────────────────────────────────────────
  useEffect(() => {
    const offReaction = onReactionUpdate((data) => {
      if (data.conversationId && data.conversationId !== conversationId) return;
      // Only process reactions that have a conversationId (DM context)
      if (!data.conversationId) return;
      // Skip own reactions — already handled optimistically
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
  }, [conversationId, user?.id]);

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
      const senderHandle = selectedMessage.senderHandle ?? 'user';
      moderationApi.report(selectedMessage.senderId, 'message', 'Reported from DM', selectedMessage.id)
        .then(() => Alert.alert('Reported', 'Thank you. We will review this within 24 hours.'));
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

  // ── D-09: Join handler — mirrors v1.7 Phase 11 D-12 globe/[roomSlug].tsx ──
  const handleJoin = useCallback(async () => {
    if (isJoining) return;
    setIsJoining(true);
    try {
      await groupsApi.join(inviteSlug);
      // Flip local state — composer enables in-place; NO route change.
      setIsMember(true);
      // The server inserted a "@<handle> joined the community" system message
      // and emitted dm:message before our socket joined the conversation room
      // (dm:join requires participation, which the preview-mode user lacks
      // until the join completes — dmHandler.ts:370). Re-fetch messages to
      // pick the system message up + (re-)join the conversation room so any
      // subsequent live messages arrive immediately.
      chat.getConversationMessages(conversationId)
        .then(({ messages: msgs }) => setMessages(msgs))
        .catch(() => {});
      joinConversation(conversationId);
      // Fire-and-forget: new group row appears in Chats list.
      useChatsStore.getState().hydrate();
    } catch (err: any) {
      Alert.alert("Couldn't join", err?.message ?? 'Please try again.');
    } finally {
      setIsJoining(false);
    }
  }, [inviteSlug, isJoining, conversationId]);

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
      sendDirectMessage(conversationId, text, replyToId, mediaUrls);
      setInput('');
      setReplyTo(null);
      stopTyping({ conversationId });
      // Inverted list: visual bottom = offset 0.
      setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      if (successfulUploads.length < uris.length) {
        Alert.alert('Partial Upload', `${successfulUploads.length} of ${uris.length} images uploaded.`);
      }
    } catch (err) {
      console.error('[media] Upload failed:', err);
      Alert.alert('Upload Error', 'Failed to upload images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [input, conversationId, replyTo]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const replyToId = replyTo?.id ?? undefined;

    // Optimistic insert — show message immediately
    const optimisticMsg: Message = {
      id: -(Date.now()),
      content,
      senderId: user?.id ?? 0,
      senderHandle: user?.handle ?? '',
      conversationId,
      createdAt: new Date().toISOString(),
      editedAt: null,
      replyToId: replyToId ?? null,
      replyTo: replyTo ?? null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    sendDirectMessage(conversationId, content, replyToId);
    setInput('');
    setReplyTo(null);
    stopTyping({ conversationId });
    // Inverted list: visual bottom = offset 0.
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
  }, [input, conversationId, replyTo, user]);

  const handleInputChange = (text: string) => {
    setInput(text);
    startTyping({ conversationId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping({ conversationId });
    }, 1500);
  };

  // Load older messages when the user scrolls to the visual top (onEndReached
  // on the inverted list). Keyset cursor = the oldest currently-loaded row's
  // createdAt; the conversation API returns the previous page + a hasMore flag.
  // Mirrors chat/local.tsx handleLoadMore. messages is chronological (oldest
  // first), so messages[0] is the oldest loaded row.
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    const oldest = messages[0];
    setLoadingOlder(true);
    chat.getConversationMessages(conversationId, { before: oldest.createdAt })
      .then(({ messages: older, hasMore: more }) => {
        if (older.length > 0) {
          setMessages((prev) => [...older, ...prev]);
        }
        setHasMore(more ?? false);
      })
      .catch(() => { /* silent — keep the current list on failure */ })
      .finally(() => setLoadingOlder(false));
  }, [hasMore, loadingOlder, messages, conversationId]);

  // Phase 12 D-09: non-member preview mode is read-only — disable the
  // long-press context menu, the swipe-to-reply gesture, and reaction toggles.
  const isReadOnlyPreview = isGroup && !isMember;
  const noopLongPress = useCallback(() => {}, []);
  const noopReactionToggle = useCallback(() => {}, []);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id;
    const bubble = (
      <MessageBubble
        message={item}
        isMe={isMe}
        onLongPress={isReadOnlyPreview ? noopLongPress : handleLongPress}
        onReactionToggle={isReadOnlyPreview ? noopReactionToggle : handleReactionToggle}
        showAvatar={isGroup}
        onProfilePress={
          isReadOnlyPreview
            ? undefined
            : () => (!isMe && item.senderHandle ? router.push(`/user/${item.senderHandle}`) : undefined)
        }
        translatedContent={translations[item.id]?.text ?? null}
        showTranslation={translations[item.id]?.showing ?? false}
        onToggleTranslation={handleToggleTranslation}
        onReplyPress={scrollToMessage}
        highlighted={item.id === highlightedId}
      />
    );
    // Phase 14 D-04: wrap matched bubble in Animated.View for highlight flash
    const wrappedBubble = item.id === flashHighlightedId ? (
      <Animated.View
        style={{
          backgroundColor: highlightAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.background, colors.accentSoft],
          }),
        }}
      >
        {bubble}
      </Animated.View>
    ) : bubble;
    if (isReadOnlyPreview) return wrappedBubble;
    return (
      <SwipeableMessage onSwipeComplete={() => {
        setReplyTo({ id: item.id, senderHandle: item.senderHandle ?? 'user', content: item.content });
      }}>
        {wrappedBubble}
      </SwipeableMessage>
    );
  }, [user?.id, handleLongPress, handleReactionToggle, translations, highlightedId, scrollToMessage, isReadOnlyPreview, isGroup, noopLongPress, noopReactionToggle, flashHighlightedId, highlightAnim, colors]);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Phase 22 (BUG fix): disable the native Stack header and render an
          inline header instead. The native Stack header is incompatible with
          react-native-keyboard-controller's KAV offset math on Android (the
          keyboard overlapped/gapped the composer). The globe/local chat screens
          already use this inline-header pattern and avoid the keyboard correctly
          with keyboardVerticalOffset={0}; this brings the DM/group screen in line. */}
      <Stack.Screen options={{ headerShown: false }} />
      <ChatHeader
        title={headerTitle}
        onBack={goBack}
        colors={colors}
        insetsTop={insets.top}
        isGroup={isGroup}
        onGroupMenu={handleGroupMenu}
        onDmMenu={handleDmMenu}
        showDmMenu={dmMenuReady}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboardBehavior}
        // `react-native-keyboard-controller`'s KAV uses native keyboard frame
        // listeners (works on Android edge-to-edge where RN's built-in KAV
        // silently no-ops since SDK 53). With the native Stack header removed
        // (inline header now sits inside this SafeAreaView, exactly like the
        // globe/local chat screens), the offset is 0 on BOTH platforms — the
        // keyboard is avoided at the bottom and there is no native header above
        // the SafeAreaView to compensate for. This matches globe/[roomSlug].tsx
        // and chat/local.tsx, which use offset 0 and work correctly on iOS and
        // Android. See `<KeyboardProvider>` wrapper in root `app/_layout.tsx`.
        keyboardVerticalOffset={0}
      >
        {/* Pinned bar — sticky above message stream (D-11), visible to all */}
        {pinnedMessage && (
          <PinnedBar
            pin={pinnedMessage}
            canUnpin={
              isGroup
                ? myGroupRole === 'admin'
                : true /* DM: either participant (D-04) */
            }
            onTap={jumpToPinned}
            onUnpin={handleDmUnpin}
          />
        )}

        {/* Inverted: newest message anchors at the visual bottom (offset 0).
            Data is reversed so index 0 = most-recent message; the native
            `inverted` prop flips rendering so it appears at the bottom — no
            timed scrollToEnd cascade or onContentSizeChange re-snap loop needed
            (that loop fought FlatList's windowed layout and caused the message
            jitter + the composer floating mid-screen after keyboard collapse;
            same fix as globe/[roomSlug].tsx + chat/local.tsx, ISSUE-8).
            onEndReached fires at the VISUAL TOP for an inverted list, so it is
            our "load older messages" trigger; the spinner renders via
            ListFooterComponent, which for an inverted list sits at the top. */}
        <FlatList
          ref={flatListRef}
          inverted
          keyboardDismissMode="on-drag"
          data={reversedMessages}
          extraData={reversedMessages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingOlder ? (
              <View style={styles.loadingOlder}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
          onScrollToIndexFailed={(info) => {
            // Approximate scroll first so the target index becomes viewable,
            // then re-attempt scrollToIndex once items have been measured.
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0.5 });
              } catch { /* silent */ }
            }, 200);
          }}
        />

        {isTyping && (
          <View style={styles.typingContainer}>
            <View style={[styles.typingPill, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.typingText, { color: colors.textMuted }]}>typing</Text>
              <View style={styles.typingDots}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.typingDot, { backgroundColor: colors.textMuted }]} />
                ))}
              </View>
            </View>
          </View>
        )}

        {/* D-11: Archived group — disabled composer, no join CTA (archived is terminal).
            D-09: Non-member preview — "Join Community" CTA.
            Default: standard composer for members of healthy groups. */}
        {isGroup && isArchived ? (
          <View style={[styles.archivedBar, { paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 24 : 8) : tabBarSpace }]}>
            <Text style={[styles.archivedBarText, { color: colors.textMuted }]}>
              This group is archived. No new messages can be sent.
            </Text>
          </View>
        ) : isGroup && !isMember ? (
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
                <Text style={styles.joinChatButtonText}>Join</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {editingMessage ? (
              <EditComposer
                initialContent={editingMessage.content}
                saving={savingEdit}
                onSave={async (next) => {
                  setSavingEdit(true);
                  try {
                    const { message } = await chat.editMessage(editingMessage.id, next);
                    setMessages((prev) => prev.map((m) => m.id === message.id ? { ...m, content: message.content, editedAt: message.editedAt } : m));
                    setEditingMessage(null);
                  } catch (err: any) {
                    Alert.alert('Could not edit message', err?.message ?? 'Please try again.');
                  } finally {
                    setSavingEdit(false);
                  }
                }}
                onCancel={() => setEditingMessage(null)}
              />
            ) : null}
            <ReplyComposer replyTo={replyTo} onCancel={() => setReplyTo(null)} />

            <View style={{ position: 'relative' }}>
              <MentionAutocomplete
                text={input}
                selection={selection}
                scope={isGroup ? 'group' : 'dm'}
                contextId={isGroup ? conversationId.toString() : (handle ?? '')}
                onSelect={(newText, newCursor) => {
                  setInput(newText);
                  setSelection({ start: newCursor, end: newCursor });
                }}
              />
              <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 24 : 8) : tabBarSpace }]}>
                <AttachmentButton onImagesSelected={handleImagesSelected} disabled={isUploading} />
                {isUploading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />}
                <View style={[styles.inputWrap, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                  <MentionTextInput
                    style={[styles.chatInput, { color: colors.text, fontFamily: FONTS.regular }]}
                    placeholder="Message..."
                    placeholderTextColor={colors.textMuted}
                    value={input}
                    onChangeText={handleInputChange}
                    selection={selection}
                    onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                    multiline
                    maxLength={2000}
                  />
                </View>
                <Pressable
                  onPress={handleSend}
                  disabled={!input.trim() || isUploading}
                  style={({ pressed }) => [{ opacity: input.trim() && !isUploading ? (pressed ? 0.8 : 1) : 0.4 }]}
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
          </>
        )}

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
          onPin={(() => {
            // D-04: DM — either participant can pin. D-02: Group — admin only.
            // D-05: authority is role-based only; community-room flag not used.
            const canPin = isGroup ? myGroupRole === 'admin' : true;
            const isSystem = selectedMessage?.kind === 'system';
            const alreadyPinned = pinnedMessage?.messageId === selectedMessage?.id;
            return canPin && !isSystem && !alreadyPinned && selectedMessage
              ? () => handleDmPin(selectedMessage)
              : undefined;
          })()}
          onUnpin={(() => {
            const canPin = isGroup ? myGroupRole === 'admin' : true;
            const alreadyPinned = pinnedMessage?.messageId === selectedMessage?.id;
            return canPin && alreadyPinned ? handleDmUnpin : undefined;
          })()}
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

// ── Inline header ─────────────────────────────────────────────────────────────
// Mirrors globe/[roomSlug].tsx's CustomHeader: back pill (left), centered title,
// and a right-side slot. Here the right slot is the 3-dot overflow menu (group
// vs DM variant) instead of globe's participant count. Top padding uses the
// safe-area inset on Android so the status bar is cleared (replaces what the
// native Stack header did); iOS gets it from the enclosing SafeAreaView.
interface ChatHeaderProps {
  title: string;
  onBack: () => void;
  colors: { background: string; surfaceGlass: string; text: string; textMuted: string };
  insetsTop: number;
  isGroup: boolean;
  onGroupMenu: () => void;
  onDmMenu: () => void;
  showDmMenu: boolean;
}

function ChatHeader({ title, onBack, colors, insetsTop, isGroup, onGroupMenu, onDmMenu, showDmMenu }: ChatHeaderProps) {
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
          <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      <View style={styles.headerTitleWrap} pointerEvents="none">
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      </View>
      {/* Right slot: group → 3-dot (vertical) opens group screen; DM → 3-dot
          (horizontal) opens Report/Block sheet. The DM menu is hidden until the
          other participant is known (mirrors the old headerRight gate). A fixed-
          width spacer keeps the title centered when no button is shown. */}
      {isGroup ? (
        <TouchableOpacity onPress={onGroupMenu} hitSlop={8} style={styles.headerMenuButton}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M12 6.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill={colors.text} />
            <Path d="M12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill={colors.text} />
            <Path d="M12 20.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill={colors.text} />
          </Svg>
        </TouchableOpacity>
      ) : showDmMenu ? (
        <TouchableOpacity onPress={onDmMenu} hitSlop={8} style={styles.headerMenuButton}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z" fill={colors.textMuted} />
          </Svg>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerMenuButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // ── Inline header ──────────────────────────────────────────────────────────
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
  headerTitleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
  headerMenuButton: {
    width: 44,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: { paddingHorizontal: 12, paddingVertical: 12 },
  loadingOlder: { paddingVertical: 12, alignItems: 'center' },
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
  typingText: { fontSize: 12, fontFamily: FONTS.medium },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 2.5 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
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
  // D-11: Archived bar — same spacing as joinChatBar but text-only, no button.
  archivedBar: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archivedBarText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  // D-09: Join CTA bar — mirrors v1.7 Phase 11 D-12 globe/[roomSlug].tsx joinChatBar.
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
