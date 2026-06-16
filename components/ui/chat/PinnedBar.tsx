import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, RADIUS, SHADOWS } from '@/constants';
import type { PinnedMessageRow } from '@/services/api';

// ── Date formatter ──────────────────────────────────────────────────────────
function formatPinDate(pinnedAt: string): string {
  const date = new Date(pinnedAt);
  const now = new Date();
  const thisYear = now.getFullYear();
  const pinYear = date.getFullYear();

  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();

  if (pinYear === thisYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${pinYear}`;
}

// ── Unpin icon (outline pushpin SVG) ──────────────────────────────────────
function UnpinIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3 6h4l-3.5 5 1.5 6-5-3-5 3 1.5-6L5 8h4l3-6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15v7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────
export interface PinnedBarProps {
  pin: PinnedMessageRow;
  canUnpin: boolean;
  onTap: () => void;
  onUnpin: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────
export function PinnedBar({ pin, canUnpin, onTap, onUnpin }: PinnedBarProps) {
  const { colors } = useTheme();

  const preview =
    pin.previewText && pin.previewText.length > 60
      ? `${pin.previewText.slice(0, 60)}…`
      : (pin.previewText ?? '');

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      onPress={onTap}
      activeOpacity={0.85}
    >
      {/* Left: thumbnail or text snippet */}
      <View style={styles.content}>
        {pin.pinnedMediaUrl ? (
          <View style={styles.row}>
            <Image
              source={{ uri: pin.pinnedMediaUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <View style={styles.textBlock}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                Photo message
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                Pinned on {formatPinDate(pin.pinnedAt)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {preview}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              Pinned on {formatPinDate(pin.pinnedAt)}
            </Text>
          </View>
        )}
      </View>

      {/* Right: unpin icon — only for empowered users (D-14) */}
      {canUnpin && (
        <TouchableOpacity
          onPress={onUnpin}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.unpinButton}
          activeOpacity={0.7}
        >
          <UnpinIcon color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default PinnedBar;

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...SHADOWS.sm,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thumbnail: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: '#E0E0E0',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: FONTS.regular,
  },
  unpinButton: {
    padding: 4,
  },
});
