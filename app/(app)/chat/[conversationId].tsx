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
  TextInput,
  TouchableOpacity,
  Alert,
  Pressable,
} from 'react-native';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useKeyboardBehavior } from '@/hooks/useKeyboardBehavior';
import { useScrollToMessage } from '@/hooks/useScrollToMessage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { chat, moderationApi, reactionsApi } from '@/services/api';
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
  onReactionUpdate,
  onMediaRemoved,
  onMediaRejected,
} from '@/services/socket';
import { AttachmentButton } from '@/components/ui/chat/AttachmentButton';
import { requestMediaUploadUrls, uploadToSpaces, confirmMediaUpload } from '@/services/upload';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
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
  const { conversationId: rawId, handle } = useLocalSearchParams<{
    conversationId: string;
    handle?: string;
  }>();
  const conversationId = parseInt(rawId);
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const keyboardBehavior = useKeyboardBehavior();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 500);
    }).catch(() => setIsLoading(false));

    joinConversation(conversationId);

    const offDm = onDirectMessage((msg) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
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

    return () => {
      leaveConversation(conversationId);
      offDm();
      offTypingStart();
      offTypingStop();
      offRejected();
      offMediaRemoved();
      offMediaRejected();
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
    sendDirectMessage(conversationId, content, replyToId);
    setInput('');
    setReplyTo(null);
    stopTyping({ conversationId });
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [input, conversationId, replyTo]);

  const handleInputChange = (text: string) => {
    setInput(text);
    startTyping({ conversationId });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping({ conversationId });
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
          showAvatar={false}
          translatedContent={translations[item.id]?.text ?? null}
          showTranslation={translations[item.id]?.showing ?? false}
          onToggleTranslation={handleToggleTranslation}
          onReplyPress={scrollToMessage}
          highlighted={item.id === highlightedId}
        />
      </SwipeableMessage>
    );
  }, [user?.id, handleLongPress, handleReactionToggle, translations, highlightedId, scrollToMessage]);

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
        behavior={keyboardBehavior}
        keyboardVerticalOffset={100}
      >
        <FlatList
          ref={flatListRef}
          keyboardDismissMode="on-drag"
          data={messages}
          extraData={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => {
            if (!hasScrolledRef.current) {
              flatListRef.current?.scrollToEnd({ animated: false });
              hasScrolledRef.current = true;
            }
          }}
          onScrollToIndexFailed={(info) => { flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true }); }}
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

        <ReplyComposer replyTo={replyTo} onCancel={() => setReplyTo(null)} />

        <View style={[styles.inputBar, { paddingBottom: keyboardVisible ? (Platform.OS === 'ios' ? 24 : 8) : tabBarSpace }]}>
          <AttachmentButton onImagesSelected={handleImagesSelected} disabled={isUploading} />
          {isUploading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />}
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
    </SafeAreaView>
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
