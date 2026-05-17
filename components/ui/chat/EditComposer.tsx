import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, COLORS } from '@/constants';

interface EditComposerProps {
  initialContent: string;
  saving: boolean;
  onSave: (next: string) => void;
  onCancel: () => void;
}

export function EditComposer({
  initialContent,
  saving,
  onSave,
  onCancel,
}: EditComposerProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialContent);

  const canSave =
    !saving &&
    text.trim().length > 0 &&
    text.trim() !== initialContent.trim();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceElevated }]}>
      <View style={[styles.bar, { backgroundColor: colors.primary }]} />
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.primary }]}>
          Edit message
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: FONTS.regular,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Edit message…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          editable={!saving}
          autoFocus
        />
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onCancel}
            disabled={saving}
            activeOpacity={0.7}
            style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.buttonText, { color: colors.textMuted, fontFamily: FONTS.medium }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onSave(text.trim())}
            disabled={!canSave}
            activeOpacity={0.7}
            style={[
              styles.button,
              styles.saveButton,
              { backgroundColor: canSave ? COLORS.primary : colors.border },
            ]}
          >
            <Text style={[styles.buttonText, { color: canSave ? '#FFF' : colors.textMuted, fontFamily: FONTS.semiBold }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={onCancel} hitSlop={8} style={styles.closeButton}>
        <Text style={[styles.closeText, { color: colors.textMuted }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default EditComposer;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  bar: {
    width: 4,
    minHeight: 32,
    borderRadius: 2,
    marginRight: 8,
    marginTop: 2,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  saveButton: {},
  buttonText: {
    fontSize: 14,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  closeText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
});
