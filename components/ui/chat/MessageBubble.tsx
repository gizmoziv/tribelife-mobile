import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, StyleSheet, Linking } from 'react-native';
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

// Parse message content into plain text, @mention, and URL fragments.
// URLs are matched first (so a URL containing an @ won't be split into a
// false mention); within non-URL segments we then split on @mention.
type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; handle: string }
  | { kind: 'url'; text: string; url: string };

// Matches: full URLs (http/https), www-prefixed URLs, and bare domains with a
// recognised TLD (e.g. tribelife.app, example.com/path). The TLD list is
// curated to keep false positives ("Dr.Smith", "version2.0") low while
// covering the common cases users actually paste.
const URL_REGEX = /\b(?:https?:\/\/[^\s<>]+|www\.[^\s<>]+|(?:[a-zA-Z0-9][a-zA-Z0-9-]*\.)+(?:com|net|org|edu|gov|mil|io|app|co|ai|dev|me|tv|info|biz|us|uk|de|fr|jp|au|nz|il|eu|ca|in|br|cn|ru|tech|online|store|site|xyz|ly|so|fm|to|cc|gg|club|news|blog)(?:\/[^\s<>]*)?)/gi;
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;

function parseMentions(text: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
    }
    parts.push({ kind: 'mention', text: match[0], handle: match[1].toLowerCase() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: 'text', text: text.slice(lastIndex) });
  }
  return parts;
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(content)) !== null) {
    // Skip bare domains that are actually the host part of an email address.
    if (match.index > 0 && content[match.index - 1] === '@') {
      continue;
    }
    if (match.index > lastIndex) {
      parts.push(...parseMentions(content.slice(lastIndex, match.index)));
    }
    // Trim trailing punctuation that's almost never part of the URL.
    let url = match[0];
    const trailingMatch = url.match(/[.,;:!?)\]}'"]+$/);
    if (trailingMatch) {
      url = url.slice(0, -trailingMatch[0].length);
    }
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parts.push({ kind: 'url', text: url, url: target });
    lastIndex = match.index + url.length;
  }
  if (lastIndex < content.length) {
    parts.push(...parseMentions(content.slice(lastIndex)));
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

  const handleUrlPress = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);

  const renderContent = (baseColor: string, mentionColor: string, linkColor: string) => {
    if (!displayContent) return null;
    const parts = parseContent(displayContent);
    return (
      <Text style={[styles.bubbleText, { color: baseColor, writingDirection: textDirection }]}>
        {parts.map((p, i) => {
          if (p.kind === 'mention') {
            return (
              <Text
                key={i}
                style={{ color: mentionColor, fontFamily: FONTS.semiBold }}
                onPress={() => handleMentionPress(p.handle)}
              >
                {p.text}
              </Text>
            );
          }
          if (p.kind === 'url') {
            return (
              <Text
                key={i}
                style={{ color: linkColor, textDecorationLine: 'underline' }}
                onPress={() => handleUrlPress(p.url)}
              >
                {p.text}
              </Text>
            );
          }
          return <Text key={i}>{p.text}</Text>;
        })}
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

  // System messages (e.g. "@handle joined the chat") render as a centered
  // pill with no avatar, bubble, timestamp, or reactions — WhatsApp/Slack
  // pattern. The @handle inside the body stays tappable via the shared
  // mention parser so users can still open the new member's profile.
  if (message.kind === 'system') {
    const parts = parseContent(message.content);
    return (
      <View style={styles.systemRow}>
        <Text style={[styles.systemText, { color: colors.textMuted }]}>
          {parts.map((p, i) => {
            if (p.kind === 'mention') {
              return (
                <Text
                  key={i}
                  style={{ color: COLORS.primary, fontFamily: FONTS.semiBold }}
                  onPress={() => handleMentionPress(p.handle)}
                >
                  {p.text}
                </Text>
              );
            }
            if (p.kind === 'url') {
              return (
                <Text
                  key={i}
                  style={{ color: COLORS.primary, textDecorationLine: 'underline' }}
                  onPress={() => handleUrlPress(p.url)}
                >
                  {p.text}
                </Text>
              );
            }
            return <Text key={i}>{p.text}</Text>;
          })}
        </Text>
      </View>
    );
  }

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
              {/* Reply quotes intentionally freeze to original content — edit feature does not rewrite replyTo.content (PLAN 260517-hiy). */}
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
              {renderContent('#FFF', '#FFE9A8', '#E0F0FF')}
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
              {/* Left accent bar when this bubble @mentions me. Absolute-
                  positioned so the surrounding content still readable — any
                  background tint kills contrast on Android light mode. */}
              {mentionsMe && (
                <View style={[styles.mentionAccent, { backgroundColor: COLORS.primary }]} />
              )}
              {/* Reply preview inside bubble */}
              {/* Reply quotes intentionally freeze to original content — edit feature does not rewrite replyTo.content (PLAN 260517-hiy). */}
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
              {renderContent(colors.text, COLORS.primary, COLORS.primary)}
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
          {formatTime(message.createdAt)}{(message as { editedAt?: string | null }).editedAt ? ' (edited)' : ''}
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
  // Bubble-level offset so the left accent bar has room without overlapping
  // the text. No background tint — Android light mode doesn't composite rgba
  // cleanly over surfaceGlass and the result is unreadable.
  bubbleMentionsMe: {
    paddingLeft: 18,
  },
  mentionAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
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
  systemRow: {
    alignSelf: 'center',
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    maxWidth: '85%',
  },
  systemText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    textAlign: 'center',
    lineHeight: 18,
  },
});
