import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { FONTS, COLORS, SHADOWS } from '@/constants';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { ReactionPills } from '@/components/ui/chat/ReactionPills';
import { ImageGrid } from '@/components/ui/chat/ImageGrid';
import { ImageViewer } from '@/components/ui/chat/ImageViewer';
import type { Message, GlobeMessage } from '@/types';

// Parse message content into plain text and @mention fragments.
// Returns an array of { text, isMention, handle } parts.
function parseContent(content: string): Array<{ text: string; isMention: boolean; handle?: string }> {
  const regex = /@([a-zA-Z0-9_]+)/g;
  const parts: Array<{ text: string; isMention: boolean; handle?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index), isMention: false });
    }
    parts.push({ text: match[0], isMention: true, handle: match[1].toLowerCase() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), isMention: false });
  }
  return parts;
}

interface MessageBubbleProps {
  message: Message | GlobeMessage;
  isMe: boolean;
  onLongPress: (message: Message | GlobeMessage) => void;
  onReactionToggle: (messageId: number, emoji: string) => void;
  showAvatar?: boolean;
  onProfilePress?: () => void;
  onReplyPress?: (messageId: number) => void;
  highlighted?: boolean;
  translatedContent?: string | null;
  showTranslation?: boolean;
  onToggleTranslation?: (messageId: number) => void;
}

export function MessageBubble({
  message,
  isMe,
  onLongPress,
  onReactionToggle,
  showAvatar = true,
  onProfilePress,
  onReplyPress,
  highlighted,
  translatedContent,
  showTranslation,
  onToggleTranslation,
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const mediaUrls = message.mediaUrls;
  const hasMedia = mediaUrls && mediaUrls.length > 0;
  const isEmpty = !message.content && !hasMedia;
  const BUBBLE_WIDTH = 260;

  const displayContent = (showTranslation && translatedContent) ? translatedContent : message.content;
  const isRTL = displayContent ? /[\u0590-\u05FF\u0600-\u06FF]/.test(displayContent) : false;
  const textDirection = isRTL ? 'rtl' as const : 'ltr' as const;

  // Detect if the current user is mentioned — gives the bubble a subtle tint
  const myHandle = user?.handle?.toLowerCase();
  const mentionsMe = !!(myHandle && displayContent && new RegExp(`@${myHandle}(?![a-zA-Z0-9_])`, 'i').test(displayContent));

  const handleMentionPress = useCallback((handle: string) => {
    router.push(`/user/${handle}`);
  }, [router]);

  const renderContent = (baseColor: string, mentionColor: string) => {
    if (!displayContent) return null;
    const parts = parseContent(displayContent);
    return (
      <Text style={[styles.bubbleText, { color: baseColor, writingDirection: textDirection }]}>
        {parts.map((p, i) =>
          p.isMention && p.handle ? (
            <Text
              key={i}
              style={{ color: mentionColor, fontFamily: FONTS.semiBold }}
              onPress={() => handleMentionPress(p.handle!)}
            >
              {p.text}
            </Text>
          ) : (
            <Text key={i}>{p.text}</Text>
          ),
        )}
      </Text>
    );
  };

  const handleImagePress = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

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
    <View style={[styles.container, isMe && styles.containerMe, highlighted && styles.highlighted]}>
      {/* Avatar */}
      {!isMe && showAvatar && (
        <TouchableOpacity onPress={onProfilePress} activeOpacity={0.7}>
          <AvatarCircle
            name={message.senderHandle ?? '?'}
            size={32}
            showRing={false}
            imageUrl={message.senderAvatar ?? undefined}
          />
        </TouchableOpacity>
      )}

      <View style={isMe ? styles.bubbleWrapMe : styles.bubbleWrap}>
        {/* Sender name */}
        {!isMe && (
          <TouchableOpacity onPress={onProfilePress} activeOpacity={0.7}>
            <Text style={[styles.senderHandle, { color: COLORS.primary }]}>
              @{message.senderHandle}
            </Text>
          </TouchableOpacity>
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
                <Pressable onPress={() => onReplyPress?.(replyTo.id)} style={[styles.replyPreview, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
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
                </Pressable>
              )}
              {hasMedia && (
                <View style={message.content ? styles.mediaWithText : undefined}>
                  <ImageGrid
                    mediaUrls={mediaUrls}
                    bubbleWidth={BUBBLE_WIDTH - 28}
                    onImagePress={handleImagePress}
                    borderRadius={14}
                  />
                </View>
              )}
              {renderContent('#FFF', '#FFE9A8')}
              {translatedContent && (
                <TouchableOpacity
                  onPress={() => onToggleTranslation?.(message.id)}
                  style={styles.translationToggle}
                >
                  <Text style={[styles.translationToggleText, { color: 'rgba(255,255,255,0.7)' }]}>
                    {showTranslation ? 'Show original' : 'Show translation'}
                  </Text>
                </TouchableOpacity>
              )}
              {isEmpty && (
                <Text style={[styles.removedText, { color: 'rgba(255,255,255,0.6)' }]}>
                  Image removed by moderation
                </Text>
              )}
            </LinearGradient>
          ) : (
            <View style={[
              styles.bubble,
              { backgroundColor: colors.surfaceGlass },
              mentionsMe && styles.bubbleMentionsMe,
            ]}>
              {/* Reply preview inside bubble */}
              {replyTo && (
                <Pressable onPress={() => onReplyPress?.(replyTo.id)} style={[styles.replyPreview, { backgroundColor: colors.surface }]}>
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
                </Pressable>
              )}
              {hasMedia && (
                <View style={message.content ? styles.mediaWithText : undefined}>
                  <ImageGrid
                    mediaUrls={mediaUrls}
                    bubbleWidth={BUBBLE_WIDTH - 28}
                    onImagePress={handleImagePress}
                    borderRadius={14}
                  />
                </View>
              )}
              {renderContent(colors.text, COLORS.primary)}
              {translatedContent && (
                <TouchableOpacity
                  onPress={() => onToggleTranslation?.(message.id)}
                  style={styles.translationToggle}
                >
                  <Text style={[styles.translationToggleText, { color: colors.primary }]}>
                    {showTranslation ? 'Show original' : 'Show translation'}
                  </Text>
                </TouchableOpacity>
              )}
              {isEmpty && (
                <Text style={[styles.removedText, { color: colors.textMuted }]}>
                  Image removed by moderation
                </Text>
              )}
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

      {/* Full-screen image viewer */}
      {hasMedia && (
        <ImageViewer
          visible={viewerVisible}
          images={mediaUrls}
          initialIndex={viewerIndex}
          onClose={() => setViewerVisible(false)}
        />
      )}
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
  highlighted: {
    backgroundColor: 'rgba(232, 146, 47, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 4,
    marginHorizontal: -4,
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
  bubbleMentionsMe: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(139, 69, 214, 0.12)',
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
  mediaWithText: {
    marginBottom: 6,
  },
  removedText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    fontStyle: 'italic',
  },
  translationToggle: {
    marginTop: 4,
  },
  translationToggleText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
});
