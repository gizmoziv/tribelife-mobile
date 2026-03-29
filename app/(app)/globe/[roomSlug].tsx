import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useGlobeStore } from '@/store/globeStore';
import { globeApi, reactionsApi } from '@/services/api';
import {
  connectSocket,
  getSocket,
  joinGlobeRoom,
  leaveGlobeRoom,
  sendGlobeMessage,
  sendGlobeTyping,
  onGlobeMessage,
  onGlobeParticipants,
  onGlobeTyping,
  onGlobeAgeGated,
  onGlobeRateLimited,
  onReactionUpdate,
  onMediaRemoved,
  onMediaRejected,
} from '@/services/socket';
import { AttachmentButton } from '@/components/ui/chat/AttachmentButton';
import { requestMediaUploadUrls, uploadToSpaces, confirmMediaUpload } from '@/services/upload';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { MessageBubble } from '@/components/ui/chat/MessageBubble';
import { ContextMenu } from '@/components/ui/chat/ContextMenu';
import { ReplyComposer } from '@/components/ui/chat/ReplyComposer';
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

export default function GlobeRoomChat() {
  const { roomSlug } = useLocalSearchParams<{ roomSlug: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
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
  const [isUploading, setIsUploading] = useState(false);
  const [isAgeGated, setIsAgeGated] = useState(false);
  const [ageGateHours, setAgeGateHours] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<GlobeMessage | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; senderHandle: string; content: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const room = useMemo(
    () => rooms.find((r) => r.slug === roomSlug),
    [rooms, roomSlug],
  );

  const globeRoomId = `globe:${roomSlug}`;

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

  // ── Socket setup and message loading ────────────────────────────────────
  useEffect(() => {
    if (!roomSlug) return;

    setActiveRoom(roomSlug);
    setLoadingMessages(true);

    // Mark room as read on entry
    globeApi.markRead(roomSlug).catch(() => {});
    markRoomRead(roomSlug);

    // Load initial messages (keep chronological order -- newest last for inverted FlatList)
    globeApi
      .messages(roomSlug)
      .then(({ messages: msgs, hasMore }) => {
        setMessages(msgs);
        if (!hasMore) {
          prependMessages([], hasMore);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));

    // Join room via socket
    connectSocket().then(() => {
      joinGlobeRoom(roomSlug);
    });

    // Register listeners (outside .then to ensure cleanup works)
    const offMessage = onGlobeMessage((data: GlobeMessage) => {
      addMessage(data);
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
      const updatedMsgs = messages.map((msg) => {
        if (msg.id === data.messageId) {
          return { ...msg, mediaUrls: data.remainingUrls.length > 0 ? data.remainingUrls : null };
        }
        return msg;
      });
      setMessages(updatedMsgs);
    });

    const offMediaRejected = onMediaRejected((data) => {
      Alert.alert('Image Removed', data.message);
    });

    // Reconnection handler
    const socket = getSocket();
    const handleReconnect = () => {
      joinGlobeRoom(roomSlug);
    };
    socket?.on('connect', handleReconnect);

    return () => {
      offMessage();
      offParticipants();
      offTyping();
      offAgeGated();
      offRateLimited();
      offMediaRemoved();
      offMediaRejected();
      socket?.off('connect', handleReconnect);
      leaveGlobeRoom(roomSlug);
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

      // Update messages in the globe store
      const updatedMessages = messages.map((msg) => {
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
      });
      setMessages(updatedMessages);
    });

    return () => { offReaction(); };
  }, [globeRoomId, user?.id, messages, setMessages]);

  // ── Context menu handlers ───────────────────────────────────────────────
  const handleLongPress = useCallback((message: Message | GlobeMessage) => {
    setSelectedMessage(message as GlobeMessage);
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
    setMenuVisible(false);
    Alert.alert('Report', 'This message has been flagged for review.');
  }, []);

  const handleReactionToggle = useCallback(async (messageId: number, emoji: string) => {
    try {
      await reactionsApi.toggle(messageId, emoji);
    } catch { /* silent */ }
  }, []);

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
    flatListRef.current?.scrollToEnd({ animated: true });
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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

  // ── Send message ────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || !roomSlug || isAgeGated || isRateLimited) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const replyToId = replyTo?.id ?? undefined;
    sendGlobeMessage(roomSlug, content, replyToId);
    setInput('');
    setReplyTo(null);
    // Auto-scroll to bottom after sending
    setIsAtBottom(true);
    resetNewMessageCount();
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    // Stop typing
    sendGlobeTyping(roomSlug, false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [input, roomSlug, isAgeGated, isRateLimited, replyTo]);

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
      return (
        <SwipeableMessage onSwipeComplete={() => {
          setReplyTo({ id: item.id, senderHandle: item.senderHandle ?? 'user', content: item.content });
        }}>
          <MessageBubble
            message={item}
            isMe={isMe}
            onLongPress={handleLongPress}
            onReactionToggle={handleReactionToggle}
          />
        </SwipeableMessage>
      );
    },
    [user?.id, handleLongPress, handleReactionToggle],
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
        <Stack.Screen
          options={{
            title: room?.displayName ?? 'Globe Room',
            headerBackTitle: 'Globe',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: room?.displayName ?? 'Globe Room',
          headerBackTitle: 'Globe',
          headerRight: () => (
            <View style={styles.headerParticipants}>
              <View style={[styles.participantDot, { backgroundColor: COLORS.secondary }]} />
              <Text style={[styles.participantText, { color: colors.textMuted }]}>
                {participantCount}
              </Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* Age gate banner */}
        {isAgeGated && (
          <View style={[styles.ageGateBanner, { backgroundColor: colors.surfaceGlass }]}>
            <Text style={[styles.ageGateText, { color: COLORS.warning }]}>
              New accounts can post after {AGE_GATE_HOURS} hours. You can post in {ageGateHours} hour{ageGateHours !== 1 ? 's' : ''}.
            </Text>
          </View>
        )}

        {/* Welcome message */}
        {room?.welcomeMessage && (
          <View style={[styles.welcomeBanner, { backgroundColor: colors.primaryGlow }]}>
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

        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => {
            if (isAtBottom) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
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

        {/* Reply composer */}
        <ReplyComposer replyTo={replyTo} onCancel={() => setReplyTo(null)} />

        {/* Chat input */}
        <View style={[styles.inputBar, { backgroundColor: 'transparent', paddingBottom: insets.bottom + 8 }]}>
          {!isAgeGated && (
            <AttachmentButton onImagesSelected={handleImagesSelected} disabled={isUploading} />
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
            <TextInput
              style={[styles.chatInput, { color: colors.text, fontFamily: FONTS.regular }]}
              placeholder={
                isAgeGated
                  ? `You can post in ${ageGateHours} hour${ageGateHours !== 1 ? 's' : ''}`
                  : 'Message...'
              }
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={handleInputChange}
              editable={!isAgeGated}
              multiline
              maxLength={2000}
              onSubmitEditing={handleSend}
            />
          </View>
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
        </View>

        {/* Context menu */}
        <ContextMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          onReact={handleReact}
          onReply={handleReply}
          onReport={handleReport}
          messageContent={selectedMessage?.content ?? ''}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  headerParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: SPACING.page,
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
    borderRadius: RADIUS.sm,
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
