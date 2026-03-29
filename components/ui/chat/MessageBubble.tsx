import React, { useCallback } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, COLORS, SHADOWS } from '@/constants';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { ReactionPills } from '@/components/ui/chat/ReactionPills';
import type { Message, GlobeMessage } from '@/types';

interface MessageBubbleProps {
  message: Message | GlobeMessage;
  isMe: boolean;
  onLongPress: (message: Message | GlobeMessage) => void;
  onReactionToggle: (messageId: number, emoji: string) => void;
  showAvatar?: boolean;
}

export function MessageBubble({
  message,
  isMe,
  onLongPress,
  onReactionToggle,
  showAvatar = true,
}: MessageBubbleProps) {
  const { colors } = useTheme();

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(message);
  }, [message, onLongPress]);

  const handleReactionToggle = useCallback(
    (emoji: string) => {
      onReactionToggle(message.id, emoji);
    },
    [message.id, onReactionToggle],
  );

  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const replyTo = message.replyTo;
  const reactions = message.reactions ?? [];

  return (
    <View style={[styles.container, isMe && styles.containerMe]}>
      {/* Avatar */}
      {!isMe && showAvatar && (
        <AvatarCircle
          name={message.senderHandle ?? '?'}
          size={32}
          showRing={false}
          imageUrl={message.senderAvatar ?? undefined}
        />
      )}

      <View style={isMe ? styles.bubbleWrapMe : styles.bubbleWrap}>
        {/* Sender name */}
        {!isMe && (
          <Text style={[styles.senderHandle, { color: COLORS.primary }]}>
            @{message.senderHandle}
          </Text>
        )}

        {/* Bubble with long press */}
        <Pressable onLongPress={handleLongPress} delayLongPress={500}>
          {isMe ? (
            <LinearGradient
              colors={[...COLORS.gradientPrimary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bubble}
            >
              {/* Reply preview inside bubble */}
              {replyTo && (
                <View style={[styles.replyPreview, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <View style={[styles.replyBar, { backgroundColor: 'rgba(255,255,255,0.6)' }]} />
                  <View style={styles.replyContent}>
                    <Text style={[styles.replyHandle, { color: 'rgba(255,255,255,0.8)' }]}>
                      @{replyTo.senderHandle}
                    </Text>
                    <Text
                      style={[styles.replyText, { color: 'rgba(255,255,255,0.7)' }]}
                      numberOfLines={1}
                    >
                      {replyTo.content}
                    </Text>
                  </View>
                </View>
              )}
              <Text style={[styles.bubbleText, { color: '#FFF' }]}>
                {message.content}
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, { backgroundColor: colors.surfaceGlass }]}>
              {/* Reply preview inside bubble */}
              {replyTo && (
                <View style={[styles.replyPreview, { backgroundColor: colors.surface }]}>
                  <View style={[styles.replyBar, { backgroundColor: colors.primary, opacity: 0.6 }]} />
                  <View style={styles.replyContent}>
                    <Text style={[styles.replyHandle, { color: colors.primary }]}>
                      @{replyTo.senderHandle}
                    </Text>
                    <Text
                      style={[styles.replyText, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {replyTo.content}
                    </Text>
                  </View>
                </View>
              )}
              <Text style={[styles.bubbleText, { color: colors.text }]}>
                {message.content}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Timestamp */}
        <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>
          {formatTime(message.createdAt)}
        </Text>

        {/* Reaction pills */}
        <ReactionPills reactions={reactions} onToggle={handleReactionToggle} />
      </View>
    </View>
  );
}

export default MessageBubble;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
    maxWidth: '85%',
  },
  containerMe: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  bubbleWrap: {
    flexShrink: 1,
  },
  bubbleWrapMe: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  senderHandle: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
    marginLeft: 2,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  // Reply preview
  replyPreview: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    minWidth: 150,
  },
  replyBar: {
    width: 3,
    borderRadius: 1.5,
    marginRight: 8,
    alignSelf: 'stretch',
  },
  replyContent: {
    flex: 1,
    overflow: 'hidden',
  },
  replyHandle: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
  },
  replyText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
});
