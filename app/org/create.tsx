import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { orgsApi, ApiError } from '@/services/api';
import { useCapability } from '@/hooks/useCapability';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PillButton } from '@/components/ui/PillButton';
import { PillToggle } from '@/components/ui/PillToggle';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { FONTS, SPACING, COLORS } from '@/constants';

// ── Slugify (verbatim from group/create.tsx lines 30-36) ─────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

// ── Org type config (alphabetical per UI-SPEC 7.2) ───────────────────────────

type OrgType = 'jcc' | 'non_profit' | 'creator' | 'community' | 'business';

const TYPE_OPTIONS: { label: string; value: OrgType }[] = [
  { label: 'Community', value: 'community' },
  { label: 'Creator', value: 'creator' },
  { label: 'JCC', value: 'jcc' },
  { label: 'Non-profit', value: 'non_profit' },
];

// ── Unavailable fallback (production view — canCreateOrg=false for all v1.5 users) ──

function UnavailableFallback() {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Text style={[styles.headerBackText, { color: colors.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create organization</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.fallbackContent}>
        <AnimatedEntry delay={0}>
          <GlassCard style={styles.fallbackCard}>
            <Text style={[styles.fallbackTitle, { color: colors.text }]}>
              Organization creation is invite-only
            </Text>
            <Text style={[styles.fallbackBody, { color: colors.textMuted }]}>
              TribeLife organizations are currently created with our team to keep the community trusted. Tell us about your group and we'll help you get set up.
            </Text>
            <PillButton
              title="Contact our team"
              variant="primary"
              size="md"
              onPress={() => router.push('/support')}
              style={styles.fallbackCta}
            />
          </GlassCard>
        </AnimatedEntry>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Active form (unreachable in v1.5; cap gate flips it on without UI changes) ─

function ActiveForm() {
  const { colors } = useTheme();
  const refreshCapabilities = useAuthStore((s) => s.refreshCapabilities);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [typeIndex, setTypeIndex] = useState(0); // defaults to 'community' (index 0)
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const slugEdited = useRef<boolean>(false);

  const selectedType = TYPE_OPTIONS[typeIndex]?.value ?? 'community';

  // ── Slug auto-generation (mirrors group/create.tsx slugEdited ref pattern) ──

  function handleNameChange(text: string) {
    const truncated = text.slice(0, 100);
    setName(truncated);
    setNameError(null);
    if (!slugEdited.current) {
      setSlug(slugify(truncated));
    }
  }

  function handleSlugChange(text: string) {
    slugEdited.current = true;
    const cleaned = text.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    setSlug(cleaned);
    setSlugError(null);
  }

  // ── Slug validation ──────────────────────────────────────────────────────────

  function validateSlug(): boolean {
    if (!/^[a-z0-9-]{3,30}$/.test(slug)) {
      setSlugError('URL can only contain letters, numbers, and hyphens');
      return false;
    }
    return true;
  }

  // ── Submit handler ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    if (!validateSlug()) return;
    if (submitting) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitting(true);

    try {
      const res = await orgsApi.create({
        slug,
        name: name.trim(),
        type: selectedType,
        description: description.trim() || undefined,
      });
      router.replace(`/org/${res.org.slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setSlugError('This URL is taken — try another');
          return;
        }
        if (err.status === 403) {
          // Refresh capabilities and retry once
          try {
            await refreshCapabilities?.();
            const res = await orgsApi.create({
              slug,
              name: name.trim(),
              type: selectedType,
              description: description.trim() || undefined,
            });
            router.replace(`/org/${res.org.slug}`);
            return;
          } catch {
            Alert.alert("Your account can't create organizations yet. Contact our team.");
            return;
          }
        }
      }
      Alert.alert("Couldn't create the organization. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const typeLabels = TYPE_OPTIONS.map((o) => o.label);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Text style={[styles.headerBackText, { color: colors.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create organization</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <AnimatedEntry delay={0}>
          <View style={styles.hero}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              Start a Jewish community on TribeLife
            </Text>
            <Text style={[styles.heroBody, { color: colors.textMuted }]}>
              Organizations bring members together with a shared name, type, and trusted admins. You can invite people, manage roles, and update your org page anytime.
            </Text>
          </View>
        </AnimatedEntry>

        {/* ── Form fields ─────────────────────────────────────────────────── */}
        <AnimatedEntry delay={60}>
          <GlassCard style={styles.card}>
            {/* Organization name */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Organization name</Text>
            <GlassInput
              value={name}
              onChangeText={handleNameChange}
              placeholder="Brooklyn Jewish Centers"
              maxLength={100}
              editable={!submitting}
            />
            <View style={styles.fieldFooterRow}>
              {nameError ? (
                <Text style={[styles.fieldError, { color: colors.error ?? COLORS.primary }]}>
                  {nameError}
                </Text>
              ) : (
                <View />
              )}
              <Text style={[styles.charCounter, { color: colors.textMuted }]}>
                {name.length}/100
              </Text>
            </View>

            <View style={styles.fieldSpacer} />

            {/* Type */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Type</Text>
            <PillToggle
              options={typeLabels}
              activeIndex={typeIndex}
              onSelect={setTypeIndex}
            />

            <View style={styles.fieldSpacer} />

            {/* Public URL */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Public URL</Text>
            <View style={styles.slugRow}>
              <View style={[styles.slugPrefix, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                <Text style={[styles.slugPrefixText, { color: colors.textMuted }]}>
                  tribelife.app/org/
                </Text>
              </View>
              <GlassInput
                value={slug}
                onChangeText={handleSlugChange}
                placeholder="brooklyn-jewish-centers"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
                containerStyle={styles.slugInput}
              />
            </View>
            <View style={styles.fieldFooterRow}>
              {slugError ? (
                <Text style={[styles.fieldError, { color: colors.error ?? COLORS.primary }]}>
                  {slugError}
                </Text>
              ) : (
                <View />
              )}
              <Text style={[styles.charCounter, { color: colors.textMuted }]}>
                {slug.length}/30
              </Text>
            </View>

            <View style={styles.fieldSpacer} />

            {/* Description */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Description (optional)</Text>
            <GlassInput
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, 500))}
              placeholder="Tell people about this organization…"
              multiline
              numberOfLines={4}
              editable={!submitting}
              style={styles.descriptionInput}
            />
            <Text style={[styles.charCounter, { color: colors.textMuted, textAlign: 'right' }]}>
              {description.length}/500
            </Text>
          </GlassCard>
        </AnimatedEntry>

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <AnimatedEntry delay={120}>
          <PillButton
            title="Create organization"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!name.trim()}
            onPress={handleSubmit}
          />
        </AnimatedEntry>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Root screen — capability gate ─────────────────────────────────────────────

export default function CreateOrgScreen() {
  const canCreateOrg = useCapability('canCreateOrg');
  if (!canCreateOrg) return <UnavailableFallback />;
  return <ActiveForm />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerBackText: {
    fontSize: 28,
    fontFamily: FONTS.regular,
    lineHeight: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  // Fallback
  fallbackContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING['2xl'],
  },
  fallbackCard: {
    padding: SPACING.lg,
    gap: SPACING.md,
    alignItems: 'center',
  },
  fallbackTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  fallbackBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
  fallbackCta: {
    marginTop: SPACING.sm,
    alignSelf: 'stretch',
  },
  // Active form
  scrollContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING['2xl'],
    gap: SPACING.lg,
  },
  hero: {
    gap: SPACING.sm,
  },
  heroTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    padding: SPACING.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldSpacer: {
    height: SPACING.md,
  },
  fieldFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  fieldError: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    flex: 1,
    marginRight: SPACING.sm,
  },
  charCounter: {
    fontSize: 12,
    fontFamily: FONTS.regular,
  },
  slugRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 0,
  },
  slugPrefix: {
    borderWidth: 1,
    borderRightWidth: 0,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    paddingHorizontal: SPACING.sm,
    justifyContent: 'center',
  },
  slugPrefixText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  slugInput: {
    flex: 1,
  },
  descriptionInput: {
    minHeight: 96,
  },
  disabledInput: {
    opacity: 0.6,
  },
});
