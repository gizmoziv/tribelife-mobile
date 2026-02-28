import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat } from '@/services/api';
import {
  joinConversation,
  leaveConversation,
  sendDirectMessage,
  onDirectMessage,
  startTyping,
  stopTyping,
  onTypingStart,
  onTypingStop,
} from '@/services/socket';
import { FONTS, COLORS } from '@/constants';
import type { Message } from '@/types';

export default function DMThreadScreen() {
  const { conversationId: rawId, handle } = useLocalSearchParams<{
    conversationId: string;
    handle?: string;
  }>();
  const conversationId = parseInt(rawId);
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (handle) navigation.setOptions({ title: `@${handle}` });
  }, [handle]);

  useEffect(() => {
    // Load history
    chat.getConversationMessages(conversationId).then(({ messages: msgs }) => {
      setMessages(msgs);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

    // Join Socket.io room
    joinConversation(conversationId);

    const offDm = onDirectMessage((msg) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) => [...prev, msg]);
      flatListRef.current?.scrollToEnd({ animated: true });
    });

    const offTypingStart = onTypingStart(({ handle: h }) => {
      if (h !== user?.handle) setIsTyping(true);
    });

    const offTypingStop = onTypingStop(() => setIsTyping(false));

    return () => {
      leaveConversation(conversationId);
      offDm();
      offTypingStart();
      offTypingStop();
    };
  }, [conversationId]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    sendDirectMessage(conversationId, content);
    setInput('');
    stopTyping({ conversationId });
  }, [input, conversationId]);

  const handleInputChange = (text: string) => {
    setInput(text);
    startTyping({ conversationId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping({ conversationId });
    }, 1500);
  };

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <DMBubble message={item} isMe={item.senderId === user?.id} />
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {isTyping && (
          <Text style={[styles.typingIndicator, { color: colors.textMuted }]}>
            typing...
          </Text>
        )}

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.surfaceAlt, color: colors.text, fontFamily: FONTS.regular }]}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={handleInputChange}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, { opacity: input.trim() ? 1 : 0.4 }]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DMBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      <View style={[
        styles.bubble,
        isMe ? { backgroundColor: COLORS.primary } : { backgroundColor: colors.surface },
      ]}>
        <Text style={[styles.bubbleText, { color: isMe ? '#FFF' : colors.text }]}>
          {message.content}
        </Text>
      </View>
      <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 12, paddingVertical: 12 },
  bubbleRow: {
    marginBottom: 10,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  bubbleRowMe: { alignSelf: 'flex-end' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { fontSize: 15, fontFamily: FONTS.regular, lineHeight: 22 },
  bubbleTime: { fontSize: 11, fontFamily: FONTS.regular, marginTop: 3, marginLeft: 4 },
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
});
