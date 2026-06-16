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
import { COLORS, FONTS, RADIUS, SHADOWS, SPACING } from '@/constants';
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

// ── Leading pin indicator (Lucide "pin") ────────────────────────────────────
// A clear, recognizable down-pointing pushpin. Stroked so it tints to theme.
function PinFilledIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 17v5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Unpin action icon (Lucide "pin-off" — slashed pushpin) ───────────────────
// A pushpin with a diagonal strike-through: the recognizable "remove pin" glyph.
function UnpinIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 17v5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m2 2 20 20"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
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
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceElevated,
          borderBottomColor: colors.border,
        },
      ]}
      onPress={onTap}
      activeOpacity={0.85}
    >
      {/* Left accent stripe in primary color */}
      <View style={styles.accentStripe} />

      {/* Leading pin glyph */}
      <View style={styles.pinIconWrap}>
        <PinFilledIcon color={colors.primary} />
      </View>

      {/* Content block */}
      <View style={styles.content}>
        {/* Overline label */}
        <Text style={[styles.overline, { color: colors.primary }]}>
          PINNED MESSAGE
        </Text>

        {pin.pinnedMediaUrl ? (
          <View style={styles.row}>
            <Image
              source={{ uri: pin.pinnedMediaUrl }}
              style={[styles.thumbnail, { borderRadius: RADIUS.sm }]}
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
          // Text-only: render directly in the `content` column. Do NOT wrap in a
          // `flex: 1` block — inside an auto-height column, flex:1 collapses the
          // children to zero height on iOS (Yoga), hiding the snippet + date.
          <>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {preview}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
              Pinned on {formatPinDate(pin.pinnedAt)}
            </Text>
          </>
        )}
      </View>

      {/* Unpin button — only for empowered users */}
      {canUnpin && (
        <TouchableOpacity
          onPress={onUnpin}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
    paddingVertical: SPACING.xs + 2,   // 6pt — compact but not cramped
    paddingRight: SPACING.sm + 4,      // 12pt right padding
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...SHADOWS.sm,
  },
  // 3pt left accent rail in primary color — the key differentiator
  accentStripe: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.xs + 2,       // 6pt gap before pin icon
  },
  pinIconWrap: {
    marginRight: SPACING.xs,           // 4pt gap between pin icon and text
    alignSelf: 'flex-start',
    marginTop: 3,                      // Align with overline baseline
  },
  content: {
    flex: 1,
    gap: 1,
  },
  overline: {
    fontSize: 9,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  thumbnail: {
    width: 32,
    height: 32,
    backgroundColor: '#E0E0E0',
  },
  textBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
    lineHeight: 17,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    lineHeight: 15,
  },
  unpinButton: {
    padding: SPACING.xs / 2,
    marginLeft: SPACING.xs,
  },
});
