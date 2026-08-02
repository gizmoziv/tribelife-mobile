import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';
import type { SocialEntry, SocialPlatform } from '@/types';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PillButton } from '@/components/ui/PillButton';
import { ActionSheetModal, ActionSheetItem } from '@/components/ui/ActionSheetModal';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SocialsRepeaterProps {
  value: SocialEntry[];
  onChange: (next: SocialEntry[]) => void;
  disabled?: boolean;
  error?: string | null;
}

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  other: 'Other',
};

const EMPTY_ROW: SocialEntry = { platform: 'linkedin', handle: '' };

// ── Validation helper ────────────────────────────────────────────────────────
// Single source of truth for the D-10/D-11 completeness rule — the screen
// imports this rather than re-deriving it.
export function isSocialEntryComplete(entry: SocialEntry): boolean {
  if (!entry.handle.trim()) return false;
  if (entry.platform === 'other' && !entry.platformOther?.trim()) return false;
  return true;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SocialsRepeater({ value, onChange, disabled, error }: SocialsRepeaterProps) {
  const [pickerOpenForIndex, setPickerOpenForIndex] = useState<number | null>(null);

  // Derive at least one row (D-10 min-1 rule is structural, not a validation message).
  const rows = value.length > 0 ? value : [EMPTY_ROW];

  function updateRow(index: number, patch: Partial<SocialEntry>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function selectPlatform(index: number, platform: SocialPlatform) {
    // Drop a stale custom name when moving away from "other".
    updateRow(index, platform === 'other' ? { platform } : { platform, platformOther: undefined });
    setPickerOpenForIndex(null);
  }

  function addRow() {
    onChange([...rows, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const pickerActions: ActionSheetItem[] = [
    { label: 'LinkedIn', onPress: () => pickerOpenForIndex !== null && selectPlatform(pickerOpenForIndex, 'linkedin') },
    { label: 'Instagram', onPress: () => pickerOpenForIndex !== null && selectPlatform(pickerOpenForIndex, 'instagram') },
    { label: 'Facebook', onPress: () => pickerOpenForIndex !== null && selectPlatform(pickerOpenForIndex, 'facebook') },
    { label: 'Other', onPress: () => pickerOpenForIndex !== null && selectPlatform(pickerOpenForIndex, 'other') },
  ];

  return (
    <View>
      {rows.map((row, index) => (
        <GlassCard key={index} style={styles.row}>
          <TouchableOpacity
            style={styles.platformSelector}
            onPress={() => !disabled && setPickerOpenForIndex(index)}
            disabled={disabled}
            accessibilityRole="button"
          >
            <Text style={styles.platformLabel}>{PLATFORM_LABELS[row.platform]}</Text>
            <Text style={styles.chevron}>{'›'}</Text>
          </TouchableOpacity>

          <GlassInput
            value={row.handle}
            onChangeText={(text) => updateRow(index, { handle: text })}
            placeholder="your profile link or @handle"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            editable={!disabled}
            containerStyle={styles.fieldSpacer}
          />

          {row.platform === 'other' && (
            <GlassInput
              value={row.platformOther ?? ''}
              onChangeText={(text) => updateRow(index, { platformOther: text })}
              placeholder="Platform name"
              maxLength={40}
              editable={!disabled}
              containerStyle={styles.fieldSpacer}
            />
          )}

          {rows.length > 1 && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => !disabled && removeRow(index)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Remove"
            >
              <Text style={styles.removeLabel}>Remove</Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      ))}

      <PillButton
        title="Add another"
        onPress={addRow}
        variant="outline"
        size="sm"
        disabled={disabled}
        style={styles.addButton}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ActionSheetModal
        visible={pickerOpenForIndex !== null}
        onClose={() => setPickerOpenForIndex(null)}
        title="Platform"
        actions={pickerActions}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    marginBottom: SPACING.md,
  },
  platformSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  platformLabel: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  chevron: {
    fontSize: 20,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },
  fieldSpacer: {
    marginBottom: SPACING.sm,
  },
  removeButton: {
    alignSelf: 'flex-end',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  removeLabel: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.error,
  },
  addButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  error: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },
});

export default SocialsRepeater;
