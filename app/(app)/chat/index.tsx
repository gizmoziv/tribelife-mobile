import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat, moderationApi } from '@/services/api';
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
} from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { PillToggle } from '@/components/ui/PillToggle';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlowBadge } from '@/components/ui/GlowBadge';
import type { Message, Conversation } from '@/types';
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
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomId = `timezone:${user?.timezone ?? 'UTC'}`;

  useEffect(() => {
    chat.getRoomMessages(roomId).then(({ messages: msgs }) => {
      setMessages(msgs);
      setIsLoading(false);
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

      return () => { offRoom(); offTypingStart(); offTypingStop(); offRejected(); };
    });
  }, [roomId]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendRoomMessage(content);
    setInput('');
  }, [input]);

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
      <MessageBubble
        message={item}
        isMe={isMe}
        onProfilePress={() => router.push(`/user/${item.senderHandle}`)}
        onBlock={handleBlock}
      />
    );
  }, [user?.id, router, handleBlock]);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.roomHeader}>
        <GlowBadge text={`${user?.timezone ?? 'UTC'} room`} color="#7A8BA8" size="sm" />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {typingUsers.length > 0 && (
        <TypingIndicator users={typingUsers} />
      )}

      <ChatInput
        value={input}
        onChangeText={handleInputChange}
        onSend={handleSend}
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

// ── DM List Panel ─────────────────────────────────────────────────────────
function DMListPanel() {
  const { colors } = useTheme();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    chat.getConversations().then(({ conversations: convos }) => {
      setConversations(convos);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
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
          <TouchableOpacity
            style={[styles.dmRow, { backgroundColor: colors.surfaceGlass }]}
            onPress={() => router.push({ pathname: '/(app)/chat/[conversationId]', params: { conversationId: item.conversationId.toString(), handle: item.participantHandle } })}
            activeOpacity={0.7}
          >
            <AvatarCircle name={item.participantName ?? '?'} size={44} />
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
        </AnimatedEntry>
      )}
      ListFooterComponent={<View style={{ height: 80 }} />}
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

function MessageBubble({
  message,
  isMe,
  onProfilePress,
  onBlock,
}: {
  message: Message;
  isMe: boolean;
  onProfilePress: () => void;
  onBlock?: (blockedUserId: number) => void;
}) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handleLongPress = () => {
    if (!isMe && message.senderId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
      showReportBlockMenu(message.senderId, message.senderHandle ?? 'user', message.id, onBlock);
    }
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={500}>
      <Animated.View style={[styles.messageBubbleContainer, isMe && styles.messageBubbleMe, { transform: [{ scale }] }]}>
        {!isMe && (
          <TouchableOpacity onPress={onProfilePress}>
            <AvatarCircle name={message.senderHandle ?? '?'} size={32} showRing={false} />
          </TouchableOpacity>
        )}
        <View>
          {!isMe && (
            <TouchableOpacity onPress={onProfilePress}>
              <Text style={[styles.senderHandle, { color: COLORS.primary }]}>
                @{message.senderHandle}
              </Text>
            </TouchableOpacity>
          )}
          {isMe ? (
            <LinearGradient
              colors={[...COLORS.gradientPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bubble}
            >
              <Text style={[styles.bubbleText, { color: '#FFF' }]}>
                {message.content}
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.bubbleText, { color: colors.text }]}>
                {message.content}
              </Text>
            </View>
          )}
          <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function ChatInput({
  value,
  onChangeText,
  onSend,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.inputBar, { backgroundColor: 'transparent' }]}>
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
        disabled={!value.trim()}
        style={({ pressed }) => [{ opacity: value.trim() ? (pressed ? 0.8 : 1) : 0.4 }]}
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
  messageBubbleContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
    maxWidth: '85%',
  },
  messageBubbleMe: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  senderHandle: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
    marginLeft: 2,
  },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 280,
    ...SHADOWS.sm,
  },
  bubbleText: { fontSize: 15, fontFamily: FONTS.regular, lineHeight: 22 },
  bubbleTime: { fontSize: 10, fontFamily: FONTS.regular, marginTop: 2, marginLeft: 4 },
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
    paddingVertical: 8,
    paddingBottom: 88,
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
