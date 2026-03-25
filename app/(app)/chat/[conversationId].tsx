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
  Alert,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat, moderationApi } from '@/services/api';
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
} from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
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
  const { conversationId: rawId, handle } = useLocalSearchParams<{
    conversationId: string;
    handle?: string;
  }>();
  const conversationId = parseInt(rawId);
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ headerShown: false });
    return () => {
      parent?.setOptions({ headerShown: true });
    };
  }, [navigation]);

  useEffect(() => {
    const goBack = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(app)/chat');
      }
    };
    navigation.setOptions({
      headerStyle: {
        backgroundColor: colors.background,
        shadowColor: 'transparent',
        elevation: 0,
      },
      headerTintColor: colors.text,
      headerTitleStyle: { fontFamily: FONTS.semiBold, fontSize: 16 },
      headerLeft: () => (
        <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors]);

  useEffect(() => {
    if (handle) navigation.setOptions({ title: `@${handle} & You` });
  }, [handle]);

  useEffect(() => {
    const otherMsg = messages.find((m) => m.senderId !== user?.id);
    const otherUserId = otherMsg?.senderId;
    const otherHandle = handle ?? otherMsg?.senderHandle ?? 'user';

    if (!otherUserId) return;

    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
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
          }}
          hitSlop={8}
          style={{ paddingRight: 12 }}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z" fill={colors.textMuted} />
          </Svg>
        </TouchableOpacity>
      ),
    });
  }, [messages, handle, user?.id]);

  useEffect(() => {
    chat.getConversationMessages(conversationId).then(({ messages: msgs }) => {
      setMessages(msgs);
      setIsLoading(false);
      if (!handle && msgs.length > 0) {
        const otherMsg = msgs.find((m) => m.senderId !== user?.id);
        if (otherMsg?.senderHandle) {
          navigation.setOptions({ title: `@${otherMsg.senderHandle} & You` });
        }
      }
    }).catch(() => setIsLoading(false));

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

    const offRejected = onMessageRejected(({ reason }) => {
      Alert.alert(
        'Message Not Sent',
        reason ?? 'Your message was rejected. It may violate community guidelines.',
      );
    });

    return () => {
      leaveConversation(conversationId);
      offDm();
      offTypingStart();
      offTypingStop();
      offRejected();
    };
  }, [conversationId]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        keyboardVerticalOffset={100}
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

        <View style={styles.inputBar}>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
            <TextInput
              style={[styles.chatInput, { color: colors.text, fontFamily: FONTS.regular }]}
              placeholder="Message..."
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={handleInputChange}
              multiline
              maxLength={2000}
            />
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!input.trim()}
            style={({ pressed }) => [{ opacity: input.trim() ? (pressed ? 0.8 : 1) : 0.4 }]}
          >
            <LinearGradient
              colors={[...COLORS.gradientPrimary]}
              style={styles.sendButton}
            >
              <SendIcon />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DMBubble({ message, isMe }: { message: Message; isMe: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
      {isMe ? (
        <LinearGradient
          colors={[...COLORS.gradientPrimary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.bubble, SHADOWS.sm]}
        >
          <Text style={[styles.bubbleText, { color: '#FFF' }]}>
            {message.content}
          </Text>
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, { backgroundColor: colors.surfaceGlass }, SHADOWS.sm]}>
          <Text style={[styles.bubbleText, { color: colors.text }]}>
            {message.content}
          </Text>
        </View>
      )}
      <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  messageList: { paddingHorizontal: 12, paddingVertical: 12 },
  bubbleRow: {
    marginBottom: 10,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  bubbleRowMe: { alignSelf: 'flex-end' },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { fontSize: 15, fontFamily: FONTS.regular, lineHeight: 22 },
  bubbleTime: { fontSize: 10, fontFamily: FONTS.regular, marginTop: 3, marginLeft: 4 },
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
    paddingVertical: 8,
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
