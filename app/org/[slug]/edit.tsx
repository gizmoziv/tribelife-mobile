import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
  Image,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { orgsApi } from '@/services/api';
import { requestOrgIconUploadUrl, confirmOrgIconUpload, uploadToSpaces } from '@/services/upload';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PillButton } from '@/components/ui/PillButton';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { FONTS, SPACING, RADIUS, COLORS } from '@/constants';

// ── Type label map (mirrors org-page screen) ──────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  jcc: 'JCC',
  non_profit: 'Non-profit',
  creator: 'Creator',
  community: 'Community',
  business: 'Business',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgData = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  iconUrl: string | null;
  role: 'admin' | 'moderator' | 'member' | null;
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EditOrgScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();

  // ── Org loading ─────────────────────────────────────────────────────────────
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    orgsApi.getBySlug(slug)
      .then(({ org: o }) => {
        setOrg({
          id: o.id,
          slug: o.slug,
          name: o.name,
          description: o.description,
          type: o.type,
          iconUrl: o.iconUrl,
          role: o.role,
        });
      })
      .catch(() => {
        // show generic error state
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // ── Admin gate ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!org) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textMuted }]}>Organization not found.</Text>
        <PillButton title="Go back" variant="outline" size="sm" onPress={() => router.back()} style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  if (org.role !== 'admin') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit organization</Text>
        <Text style={[styles.errorText, { color: colors.textMuted, marginTop: SPACING.md }]}>
          Only admins can edit this organization.
        </Text>
        <PillButton title="Go back" variant="outline" size="sm" onPress={() => router.back()} style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  return <EditForm org={org} />;
}

// ── Edit Form (only rendered for admins) ──────────────────────────────────────

function EditForm({ org }: { org: OrgData }) {
  const { colors } = useTheme();

  // ── Form state ───────────────────────────────────────────────────────────────
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? '');
  const [iconUrl, setIconUrl] = useState<string | null>(org.iconUrl);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== org.name ||
    description !== (org.description ?? '') ||
    iconUrl !== org.iconUrl;

  // ── Icon edit handler ────────────────────────────────────────────────────────

  async function handleEditIcon() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setIconUploading(true);
    const localUri = result.assets[0].uri;
    setIconPreview(localUri); // optimistic local preview

    try {
      // 1. Request presigned URL — Plan 05-04 helper
      const { uploadUrl, key } = await requestOrgIconUploadUrl(org.id);

      // 2. PUT to S3 via existing uploadToSpaces helper (services/upload.ts:33-50).
      //    The helper sets ONLY Content-Type: image/jpeg — public-read ACL is
      //    applied server-side during confirmOrgIconUpload via setPublicRead(key).
      //    Do NOT add x-amz-acl here — the presigned URL was signed without it.
      await uploadToSpaces(uploadUrl, localUri);

      // 3. Confirm — server validates key prefix, sets public-read, deletes
      //    prior icon, updates organizations.iconUrl, returns { iconUrl }.
      const { iconUrl: newIconUrl } = await confirmOrgIconUpload(org.id, key);

      setIconUrl(newIconUrl);
      setIconPreview(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setIconPreview(null); // revert preview
      Alert.alert("Couldn't upload icon. Try again?");
    } finally {
      setIconUploading(false);
    }
  }

  // ── Save handler ─────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!dirty || saving) return;

    const diff: { name?: string; description?: string; iconUrl?: string } = {};
    if (name !== org.name) diff.name = name;
    if (description !== (org.description ?? '')) diff.description = description;
    if (iconUrl !== org.iconUrl) diff.iconUrl = iconUrl ?? undefined;

    setSaving(true);
    try {
      await orgsApi.update(org.id, diff);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved');
      router.back();
    } catch {
      Alert.alert("Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const displayIcon = iconPreview ?? iconUrl;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit organization</Text>
        <Pressable
          onPress={handleSave}
          disabled={!dirty || saving}
          style={styles.headerSave}
          accessibilityLabel="Save"
          hitSlop={8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text
              style={[
                styles.headerSaveText,
                { color: dirty ? colors.primary : colors.textMuted },
              ]}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Icon edit ───────────────────────────────────────────────────── */}
        <AnimatedEntry delay={0}>
          <Pressable
            onPress={handleEditIcon}
            disabled={iconUploading}
            style={styles.iconContainer}
            accessibilityLabel="Change organization icon"
            accessibilityRole="button"
          >
            {displayIcon ? (
              <Image
                source={{ uri: displayIcon }}
                style={styles.iconImage}
              />
            ) : (
              <AvatarCircle
                name={org.name}
                size={96}
                showRing={false}
              />
            )}
            {iconUploading ? (
              <View style={styles.iconOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View style={styles.cameraOverlay}>
                <Text style={styles.cameraGlyph}>📷</Text>
              </View>
            )}
          </Pressable>
        </AnimatedEntry>

        {/* ── Editable fields ─────────────────────────────────────────────── */}
        <AnimatedEntry delay={60}>
          <GlassCard style={styles.card}>
            {/* Name */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Name</Text>
            <GlassInput
              value={name}
              onChangeText={(t) => setName(t.slice(0, 100))}
              placeholder="Organization name"
              maxLength={100}
            />
            <Text style={[styles.charCounter, { color: colors.textMuted }]}>
              {name.length}/100
            </Text>

            <View style={styles.fieldSpacer} />

            {/* Description */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Description</Text>
            <GlassInput
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, 500))}
              placeholder="Tell people about this organization…"
              multiline
              numberOfLines={4}
              style={styles.descriptionInput}
            />
            <Text style={[styles.charCounter, { color: colors.textMuted }]}>
              {description.length}/500
            </Text>
          </GlassCard>
        </AnimatedEntry>

        {/* ── Locked fields ───────────────────────────────────────────────── */}
        <AnimatedEntry delay={120}>
          <View style={styles.lockedDivider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.lockedEyebrow, { color: colors.textMuted }]}>LOCKED</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <GlassCard style={styles.card}>
            {/* Public URL */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Public URL</Text>
            <GlassInput
              value={`tribelife.app/org/${org.slug}`}
              editable={false}
              style={{ color: colors.textMuted }}
              containerStyle={styles.disabledInput}
            />
            <Text style={[styles.lockedHelper, { color: colors.textMuted }]}>
              ⓘ Contact support to change
            </Text>

            <View style={styles.fieldSpacer} />

            {/* Type */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Type</Text>
            <GlassInput
              value={TYPE_LABEL[org.type] ?? org.type}
              editable={false}
              style={{ color: colors.textMuted }}
              containerStyle={styles.disabledInput}
            />
            <Text style={[styles.lockedHelper, { color: colors.textMuted }]}>
              ⓘ Contact support to change
            </Text>
          </GlassCard>
        </AnimatedEntry>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.page,
  },
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
  headerSave: {
    width: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerSaveText: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  scrollContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING['2xl'],
    gap: SPACING.lg,
  },
  iconContainer: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    position: 'relative',
  },
  iconImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  iconOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 48,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraGlyph: {
    fontSize: 14,
  },
  card: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  fieldSpacer: {
    height: SPACING.md,
  },
  charCounter: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'right',
    marginTop: 4,
  },
  descriptionInput: {
    minHeight: 96,
  },
  lockedDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  lockedEyebrow: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1.6,
  },
  disabledInput: {
    opacity: 0.6,
  },
  lockedHelper: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 4,
  },
  errorText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
});
