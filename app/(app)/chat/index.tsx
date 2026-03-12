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
} from 'react-native';
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
} from '@/services/socket';
import { FONTS, COLORS } from '@/constants';
import type { Message, Conversation } from '@/types';

type Tab = 'local' | 'dms';

export default function ChatScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('local');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'local' && styles.tabActive]}
          onPress={() => setActiveTab('local')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'local' ? COLORS.primary : colors.textMuted }
          ]}>
            Local Chat
          </Text>
          {activeTab === 'local' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'dms' && styles.tabActive]}
          onPress={() => setActiveTab('dms')}
        >
          <Text style={[
            styles.tabText,
            { color: activeTab === 'dms' ? COLORS.primary : colors.textMuted }
          ]}>
            Direct Messages
          </Text>
          {activeTab === 'dms' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {activeTab === 'local' ? (
        <LocalChatPanel />
      ) : (
        <DMListPanel />
      )}
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
    // Load message history
    chat.getRoomMessages(roomId).then(({ messages: msgs }) => {
      setMessages(msgs);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

    // Connect and listen for new messages
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

      return () => { offRoom(); offTypingStart(); offTypingStop(); };
    });
  }, [roomId]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
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

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id;
    return (
      <MessageBubble
        message={item}
        isMe={isMe}
        onProfilePress={() => router.push(`/user/${item.senderHandle}`)}
      />
    );
  }, [user?.id, router]);

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
        <Text style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.medium }}>
          🌍 {user?.timezone ?? 'UTC'} room
        </Text>
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
        <Text style={[styles.typingIndicator, { color: COLORS.textMuted }]}>
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </Text>
      )}

      <ChatInput
        value={input}
        onChangeText={handleInputChange}
        onSend={handleSend}
      />
    </KeyboardAvoidingView>
  );
}

// ── DM List Panel ─────────────────────────────────────────────────────────
function DMListPanel() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
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
        <Text style={{ fontSize: 40 }}>💬</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
          Tap on someone's name in Local Chat to start a conversation
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.conversationId.toString()}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.dmRow, { borderBottomColor: colors.border }]}
          onPress={() => router.push({ pathname: '/(app)/chat/[conversationId]', params: { conversationId: item.conversationId.toString(), handle: item.participantHandle } })}
        >
          <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.avatarText}>
              {item.participantName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
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
      )}
    />
  );
}

// ── Shared Components ─────────────────────────────────────────────────────
function showReportBlockMenu(senderId: number, senderHandle: string, messageId: number) {
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

function MessageBubble({
  message,
  isMe,
  onProfilePress,
}: {
  message: Message;
  isMe: boolean;
  onProfilePress: () => void;
}) {
  const { colors } = useTheme();

  const handleLongPress = () => {
    if (!isMe && message.senderId) {
      showReportBlockMenu(message.senderId, message.senderHandle ?? 'user', message.id);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onLongPress={handleLongPress}
      delayLongPress={500}
    >
      <View style={[styles.messageBubbleContainer, isMe && styles.messageBubbleMe]}>
        {!isMe && (
          <TouchableOpacity onPress={onProfilePress}>
            <View style={[styles.avatarSmall, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.avatarTextSmall}>
                {message.senderHandle?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
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
          <View style={[
            styles.bubble,
            isMe
              ? { backgroundColor: COLORS.primary }
              : { backgroundColor: colors.surface },
          ]}>
            <Text style={[
              styles.bubbleText,
              { color: isMe ? '#FFF' : colors.text },
            ]}>
              {message.content}
            </Text>
          </View>
          <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
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
    <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <TextInput
        style={[styles.chatInput, { backgroundColor: colors.surfaceAlt, color: colors.text, fontFamily: FONTS.regular }]}
        placeholder="Message..."
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={2000}
        onSubmitEditing={onSend}
      />
      <TouchableOpacity
        style={[styles.sendButton, { opacity: value.trim() ? 1 : 0.4 }]}
        onPress={onSend}
        disabled={!value.trim()}
      >
        <Text style={styles.sendIcon}>↑</Text>
      </TouchableOpacity>
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    position: 'relative',
  },
  tabActive: {},
  tabText: { fontSize: 14, fontFamily: FONTS.semiBold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  roomHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
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
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextSmall: { color: '#FFF', fontSize: 14, fontFamily: FONTS.bold },
  senderHandle: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
    marginLeft: 2,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 280,
  },
  bubbleText: { fontSize: 15, fontFamily: FONTS.regular, lineHeight: 22 },
  bubbleTime: { fontSize: 11, fontFamily: FONTS.regular, marginTop: 2, marginLeft: 4 },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 12,
    fontFamily: FONTS.regular,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: '#FFF', fontSize: 20, fontFamily: FONTS.bold },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 18, fontFamily: FONTS.bold },
  dmRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dmName: { fontSize: 15, fontFamily: FONTS.semiBold },
  dmTime: { fontSize: 12, fontFamily: FONTS.regular },
  dmPreview: { fontSize: 14, fontFamily: FONTS.regular, marginTop: 2 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptySubtitle: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
