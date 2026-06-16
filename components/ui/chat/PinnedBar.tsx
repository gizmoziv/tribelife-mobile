import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
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

// ── Leading pin indicator (filled pushpin) ──────────────────────────────────
// A real pushpin: circular head at top-right, shaft angling down-left,
// needle pointing down from the clip. Filled for visual weight.
function PinFilledIcon({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      {/* Pin head (circle) */}
      <Path
        d="M15 3a3 3 0 0 1 0 6H9a3 3 0 0 1 0-6h6z"
        fill={color}
      />
      {/* Pin body / clip */}
      <Path
        d="M12 9v6"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Base plate */}
      <Path
        d="M8 15h8l-1.5 5H9.5L8 15z"
        fill={color}
      />
      {/* Needle */}
      <Line
        x1="12"
        y1="20"
        x2="12"
        y2="23"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Unpin action icon (outline pushpin) ──────────────────────────────────────
// Same geometry but stroked, used as the "remove pin" affordance.
function UnpinIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      {/* Pin head (circle outline) */}
      <Path
        d="M15 3a3 3 0 0 1 0 6H9a3 3 0 0 1 0-6h6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* Pin shaft */}
      <Path
        d="M12 9v6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* Base plate */}
      <Path
        d="M8 15h8l-1.5 5H9.5L8 15z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* Needle */}
      <Line
        x1="12"
        y1="20"
        x2="12"
        y2="23"
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
