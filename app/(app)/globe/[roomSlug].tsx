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
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useGlobeStore } from '@/store/globeStore';
import { globeApi } from '@/services/api';
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
} from '@/services/socket';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import type { GlobeMessage } from '@/types';
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
  } = useGlobeStore();

  const [input, setInput] = useState('');
  const [isAgeGated, setIsAgeGated] = useState(false);
  const [ageGateHours, setAgeGateHours] = useState(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const room = useMemo(
    () => rooms.find((r) => r.slug === roomSlug),
    [rooms, roomSlug],
  );

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

    // Load initial messages
    globeApi
      .messages(roomSlug)
      .then(({ messages: msgs, hasMore }) => {
        setMessages(msgs.reverse());
        if (!hasMore) {
          // Update hasMoreMessages in store
          prependMessages([], hasMore);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));

    // Join room via socket
    connectSocket().then(() => {
      joinGlobeRoom(roomSlug);

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
        socket?.off('connect', handleReconnect);
      };
    });

    return () => {
      leaveGlobeRoom(roomSlug);
      clearRoom();
      // Clear all typing timers
      typingClearTimers.current.forEach((timer) => clearTimeout(timer));
      typingClearTimers.current.clear();
    };
  }, [roomSlug]);

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

  // ── Send message ────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || !roomSlug || isAgeGated || isRateLimited) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendGlobeMessage(roomSlug, content);
    setInput('');
    // Stop typing
    sendGlobeTyping(roomSlug, false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [input, roomSlug, isAgeGated, isRateLimited]);

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
        <View style={[styles.messageBubbleContainer, isMe && styles.messageBubbleMe]}>
          {!isMe && (
            <AvatarCircle
              name={item.senderHandle ?? '?'}
              size={32}
              showRing={false}
              imageUrl={item.senderAvatar ?? undefined}
            />
          )}
          <View>
            {!isMe && (
              <Text style={[styles.senderHandle, { color: COLORS.primary }]}>
                @{item.senderHandle}
              </Text>
            )}
            {isMe ? (
              <LinearGradient
                colors={[...COLORS.gradientPrimary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bubble}
              >
                <Text style={[styles.bubbleText, { color: '#FFF' }]}>
                  {item.content}
                </Text>
              </LinearGradient>
            ) : (
              <View style={[styles.bubble, { backgroundColor: colors.surfaceGlass }]}>
                <Text style={[styles.bubbleText, { color: colors.text }]}>
                  {item.content}
                </Text>
              </View>
            )}
            <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      );
    },
    [user?.id, colors],
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

        {/* Message list (inverted) */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
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

        {/* Chat input */}
        <View style={[styles.inputBar, { backgroundColor: 'transparent' }]}>
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
            disabled={!input.trim() || isAgeGated || isRateLimited}
            style={({ pressed }) => [
              { opacity: input.trim() && !isAgeGated && !isRateLimited ? (pressed ? 0.8 : 1) : 0.4 },
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
  bubbleText: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 22,
  },
  bubbleTime: {
    fontSize: 10,
    fontFamily: FONTS.regular,
    marginTop: 2,
    marginLeft: 4,
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
});
