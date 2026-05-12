import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useKeyboardBehavior } from '@/hooks/useKeyboardBehavior';
import { useScrollToMessage } from '@/hooks/useScrollToMessage';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat, moderationApi, reactionsApi, notificationsApi, chats } from '@/services/api';
import { useNotificationStore } from '@/store/notificationStore';
import { useLocalChatUnreadStore } from '@/store/localChatUnreadStore';
import { useForegroundContextStore } from '@/store/foregroundContextStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguagePicker } from '@/components/ui/chat/LanguagePicker';
import {
  connectSocket,
  sendRoomMessage,
  onRoomMessage,
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
import { GlowBadge } from '@/components/ui/GlowBadge';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
import { MentionAutocomplete, type MentionScope } from '@/components/ui/chat/MentionAutocomplete';
import { MentionTextInput } from '@/components/ui/chat/MentionTextInput';
import { SwipeableMessage } from '@/components/ui/chat/SwipeableMessage';
import { timezoneToZoneName } from '@/utils/timezoneLabel';
import type { Message } from '@/types';
import Svg, { Path } from 'react-native-svg';

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Local (Timezone Room) Chat Screen ────────────────────────────────────────
// Dedicated screen for the timezone room, living in the Chats tab stack.
// Extracted from the pre-09-03 LocalChatPanel in chat/index.tsx so that
// tapping the Local Chat row in the Chats list routes here (/(app)/chat/local)
// without falling through to [conversationId].tsx — which caused a backend 500.
export default function LocalChatScreen() {
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
  const zoneName = timezoneToZoneName(user?.timezone ?? 'UTC');

  useEffect(() => {
    AsyncStorage.getItem('preferredTranslateLanguage').then((lang) => {
      if (lang) setPreferredLanguage(lang);
    });
  }, []);

  // Clear bell notifications tied to this zone room when the user opens it.
  useEffect(() => {
    notificationsApi.readContext({ roomId })
      .then(({ markedRead }) => {
        if (markedRead.length > 0) {
          useNotificationStore.getState().markManyRead(markedRead);
        }
      })
      .catch(() => { /* silent */ });
  }, [roomId]);

  // Mark the room read in globe_read_positions on mount (Plan 09-01/02).
  useEffect(() => {
    if (user?.timezone) {
      chats.markRoomRead(user.timezone).catch(() => { /* silent */ });
    }
  }, [user?.timezone]);

  // Mark this screen as the active foreground context so the _layout.tsx
  // room:message listener won't increment the Chat tab bubble while the user
  // is actively reading here.
  useFocusEffect(
    useCallback(() => {
      useForegroundContextStore.getState().setContext({ type: 'localChat' });
      useLocalChatUnreadStore.getState().reset();
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 500);
    }).catch(() => setIsLoading(false));

    const cleanups: (() => void)[] = [];

    connectSocket().then(() => {
      const offRoom = onRoomMessage((msg) => {
        setMessages((prev) => [...prev, msg]);
        flatListRef.current?.scrollToEnd({ animated: true });
      });

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
      typingClearTimersRef.current.forEach((t) => clearTimeout(t));
      typingClearTimersRef.current.clear();
    };
  }, [roomId]);

  // Recover after socket drops / backgrounding.
  useEffect(() => {
    const refetchRoom = async () => {
      setTypingUsers([]);
      typingClearTimersRef.current.forEach((t) => clearTimeout(t));
      typingClearTimersRef.current.clear();
      try {
        const { messages: fresh } = await chat.getRoomMessages(roomId);
        setMessages((prev) => {
          const pending = prev.filter((m) => m.id < 0);
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
      if (!data.roomId) return;
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
    if (translations[msgId]) {
      setTranslations(prev => ({
        ...prev,
        [msgId]: { ...prev[msgId], showing: !prev[msgId].showing },
      }));
      return;
    }
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
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: zoneName }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: zoneName }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={90}
      >
        {/* Redundant timezone GlowBadge removed in Phase 9 hotfix 2 —
            the Stack.Screen headerTitle (zoneName) already shows the room name. */}

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
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
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
    </SafeAreaView>
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

// ── Chat Input ────────────────────────────────────────────────────────────
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

// ── Report/Block helper ───────────────────────────────────────────────────
function showReportBlockMenu(
  senderId: number,
  senderHandle: string,
  messageId: number,
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
                .then(() => Alert.alert('Blocked', `@${senderHandle} has been blocked.`)),
            },
          ]);
        },
      },
    ]
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
});
