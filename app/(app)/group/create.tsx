import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { groupsApi } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import Svg, { Path } from 'react-native-svg';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export default function CreateGroupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleNameChange = (text: string) => {
    const trimmed = text.slice(0, 50);
    setName(trimmed);
    if (!slugEdited) {
      setSlug(slugify(trimmed));
    }
  };

  const handleSlugChange = (text: string) => {
    setSlugEdited(true);
    setSlug(text.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30));
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter a group name.');
      return;
    }
    setIsCreating(true);
    try {
      const { conversation } = await groupsApi.create(trimmedName, slug || undefined);
      router.replace({
        pathname: '/(app)/chat/[conversationId]',
        params: {
          conversationId: conversation.id.toString(),
          isGroup: 'true',
          groupName: conversation.groupName,
        },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/profile');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Create Group</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.content}>
          <AnimatedEntry>
            <GlassCard>
              <View style={styles.formInner}>
                <Text style={[styles.label, { color: colors.text }]}>Group Name</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="My awesome group"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={handleNameChange}
                    maxLength={50}
                    autoFocus
                  />
                </View>
                <Text style={[styles.charCount, { color: colors.textMuted }]}>
                  {name.length}/50
                </Text>

                <Text style={[styles.label, { color: colors.text, marginTop: SPACING.md }]}>Invite Link</Text>
                <View style={[styles.slugRow]}>
                  <Text style={[styles.slugPrefix, { color: colors.textMuted }]}>tribelife.app/g/</Text>
                  <View style={[styles.slugInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="my-group"
                      placeholderTextColor={colors.textMuted}
                      value={slug}
                      onChangeText={handleSlugChange}
                      maxLength={30}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <PillButton
                  title="Create Group"
                  onPress={handleCreate}
                  variant="primary"
                  size="lg"
                  loading={isCreating}
                  disabled={isCreating || !name.trim()}
                  style={{ width: '100%', marginTop: SPACING.lg }}
                />
              </View>
            </GlassCard>
          </AnimatedEntry>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
  },
  content: {
    flex: 1,
    padding: SPACING.page,
    justifyContent: 'flex-start',
    paddingTop: SPACING.xl,
  },
  formInner: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    marginBottom: 6,
  },
  inputWrap: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  charCount: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'right',
    marginTop: 4,
  },
  slugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slugPrefix: {
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  slugInputWrap: {
    flex: 1,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
