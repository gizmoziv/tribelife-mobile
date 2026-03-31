import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useKeyboardBehavior } from '@/hooks/useKeyboardBehavior';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat, moderationApi, reactionsApi } from '@/services/api';
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
} from '@/services/socket';
import { AttachmentButton } from '@/components/ui/chat/AttachmentButton';
import { requestMediaUploadUrls, uploadToSpaces, confirmMediaUpload } from '@/services/upload';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { PillToggle } from '@/components/ui/PillToggle';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
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

function GlobeIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="#7A8BA8" strokeWidth={1.5} />
    </Svg>
  );
}

type Tab = 'local' | 'dms';

export default function ChatScreen() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('local');
  const tabIndex = activeTab === 'local' ? 0 : 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.toggleContainer}>
        <PillToggle
          options={['Local Chat', 'Direct Messages']}
          activeIndex={tabIndex}
          onSelect={(i) => setActiveTab(i === 0 ? 'local' : 'dms')}
        />
      </View>

      {activeTab === 'local' ? <LocalChatPanel /> : <DMListPanel />}
    </SafeAreaView>
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
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomId = `timezone:${user?.timezone ?? 'UTC'}`;

  useEffect(() => {
    AsyncStorage.getItem('preferredTranslateLanguage').then((lang) => {
      if (lang) setPreferredLanguage(lang);
    });
  }, []);

  useEffect(() => {
    chat.getRoomMessages(roomId).then(({ messages: msgs }) => {
      setMessages(msgs);
      setIsLoading(false);
      // Multiple scroll attempts for Android's slower rendering pipeline
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 500);
    }).catch(() => setIsLoading(false));

    connectSocket().then(() => {
      const offRoom = onRoomMessage((msg) => {
        setMessages((prev) => [...prev, msg]);
        flatListRef.current?.scrollToEnd({ animated: true });
      });

      const offTypingStart = onTypingStart(({ handle }) => {
        if (handle === user?.handle) return;
        setTypingUsers((prev) => prev.includes(handle) ? prev : [...prev, handle]);
      });

      const offTypingStop = onTypingStop(({ handle }) => {
        setTypingUsers((prev) => prev.filter((h) => h !== handle));
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

      return () => { offRoom(); offTypingStart(); offTypingStop(); offRejected(); offMediaRemoved(); offMediaRejected(); };
    });
  }, [roomId]);

  // ── Real-time reaction updates ──────────────────────────────────────────
  useEffect(() => {
    const offReaction = onReactionUpdate((data) => {
      if (data.roomId && data.roomId !== roomId) return;
      // Only process reactions that have a roomId (timezone room context)
      if (!data.roomId) return;

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

  const handleReact = useCallback(async (emoji: string) => {
    if (!selectedMessage) return;
    setMenuVisible(false);
    try {
      await reactionsApi.toggle(selectedMessage.id, emoji);
    } catch { /* silent -- socket broadcast will update UI */ }
  }, [selectedMessage]);

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    setMenuVisible(false);
    setReplyTo({
      id: selectedMessage.id,
      senderHandle: selectedMessage.senderHandle ?? 'user',
      content: selectedMessage.content,
    });
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
    try {
      await reactionsApi.toggle(messageId, emoji);
    } catch { /* silent */ }
  }, []);

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
        />
      </SwipeableMessage>
    );
  }, [user?.id, handleLongPress, handleReactionToggle, translations, router]);

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
        data={messages}
        extraData={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => {}}
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
      />

      <ContextMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onReact={handleReact}
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

  useEffect(() => {
    chat.getConversations().then(({ conversations: convos }) => {
      setConversations(convos);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

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
      renderItem={({ item, index }) => (
        <AnimatedEntry delay={index * 40}>
          <SwipeableConversationRow
            onDelete={() => handleHideConversation(item.conversationId)}
          >
            <TouchableOpacity
              style={[styles.dmRow, { backgroundColor: colors.surfaceGlass }]}
              onPress={() => router.push({ pathname: '/(app)/chat/[conversationId]', params: { conversationId: item.conversationId.toString(), handle: item.participantHandle } })}
              activeOpacity={0.7}
            >
              <AvatarCircle name={item.participantName ?? '?'} size={44} imageUrl={item.participantAvatar ?? undefined} />
              <View style={{ flex: 1 }}>
                <View style={styles.dmRowTop}>
                  <Text style={[styles.dmName, { color: colors.text }]}>
                    @{item.participantHandle}
                  </Text>
                  {item.lastMessage && (
                    <Text style={[styles.dmTime, { color: colors.textMuted }]}>
                      {formatTime(item.lastMessage.createdAt)}
                    </Text>
                  )}
                </View>
                <Text style={[styles.dmPreview, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.lastMessage?.content ?? 'Start a conversation'}
                </Text>
              </View>
            </TouchableOpacity>
          </SwipeableConversationRow>
        </AnimatedEntry>
      )}
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
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  isUploading?: boolean;
  onImagesSelected?: (uris: string[]) => void;
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
    <View style={[styles.inputBar, { backgroundColor: 'transparent', paddingBottom: bottomPadding }]}>
      {onImagesSelected && (
        <AttachmentButton onImagesSelected={onImagesSelected} disabled={isUploading} />
      )}
      {isUploading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />}
      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
        <TextInput
          style={[styles.chatInput, { color: colors.text, fontFamily: FONTS.regular }]}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
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
  dmPreview: { fontSize: 14, fontFamily: FONTS.regular, marginTop: 2 },
  emptyState: { flex: 1, padding: SPACING.xl, justifyContent: 'center' },
  emptyInner: { alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptySubtitle: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
