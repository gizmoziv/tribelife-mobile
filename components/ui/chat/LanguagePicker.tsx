import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, RADIUS, SHADOWS } from '@/constants';

const LANGUAGES = [
  { code: 'English', label: 'English', flag: '🇬🇧' },
  { code: 'Hebrew', label: 'עברית', flag: '🇮🇱' },
  { code: 'French', label: 'Français', flag: '🇫🇷' },
  { code: 'Spanish', label: 'Español', flag: '🇪🇸' },
  { code: 'Russian', label: 'Русский', flag: '🇷🇺' },
  { code: 'Portuguese', label: 'Português', flag: '🇧🇷' },
  { code: 'German', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'Yiddish', label: 'ייִדיש', flag: '📜' },
  { code: 'Arabic', label: 'العربية', flag: '🇸🇦' },
];

interface LanguagePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (language: string) => void;
  selectedLanguage?: string;
}

export function LanguagePicker({
  visible,
  onClose,
  onSelect,
  selectedLanguage,
}: LanguagePickerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              paddingBottom: insets.bottom + 20,
            },
          ]}
          onPress={() => {}}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            Translate to
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ScrollView>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langRow,
                  selectedLanguage === lang.code && {
                    backgroundColor: colors.primaryGlow,
                  },
                ]}
                onPress={() => {
                  onSelect(lang.code);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[styles.langLabel, { color: colors.text }]}>
                  {lang.label}
                </Text>
                {selectedLanguage === lang.code && (
                  <Text style={[styles.checkmark, { color: colors.primary }]}>
                    ✓
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default LanguagePicker;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.96)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '60%',
    ...SHADOWS.lg,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    marginBottom: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    gap: 12,
  },
  flag: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  langLabel: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    flex: 1,
  },
  checkmark: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
  },
});
