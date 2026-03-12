import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, COLORS } from '@/constants';
import { supportApi } from '@/services/api';

export default function SupportScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSending(true);
    try {
      await supportApi.send(subject.trim(), message.trim());
      Alert.alert(
        'Message Sent',
        'Thank you for reaching out! We\'ll get back to you as soon as possible.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch {
      Alert.alert('Error', 'Failed to send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={[styles.backButton, { color: COLORS.primary }]}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Support</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={[styles.description, { color: colors.textMuted }]}>
            Have a question, issue, or feedback? Send us a message and we'll get back to you.
          </Text>

          {/* Subject */}
          <Text style={[styles.label, { color: colors.textMuted }]}>SUBJECT</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
            placeholder="What's this about?"
            placeholderTextColor={colors.textMuted}
            value={subject}
            onChangeText={setSubject}
            maxLength={200}
            returnKeyType="next"
          />

          {/* Message */}
          <Text style={[styles.label, { color: colors.textMuted }]}>MESSAGE</Text>
          <TextInput
            style={[
              styles.input,
              styles.messageInput,
              { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
            ]}
            placeholder="Describe your issue or feedback..."
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            maxLength={5000}
            multiline
            textAlignVertical="top"
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, { opacity: canSubmit && !sending ? 1 : 0.5 }]}
            onPress={handleSubmit}
            disabled={!canSubmit || sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>Send Message</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 16, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: { fontSize: 16, fontFamily: FONTS.medium },
  title: { fontSize: 18, fontFamily: FONTS.bold },
  headerSpacer: { width: 40 },
  description: { fontSize: 14, fontFamily: FONTS.regular, lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 11, fontFamily: FONTS.semiBold, letterSpacing: 1, paddingLeft: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  messageInput: {
    minHeight: 160,
    paddingTop: 12,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#FFF', fontSize: 15, fontFamily: FONTS.bold },
});
