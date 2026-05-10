import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { orgsApi } from '@/services/api';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';
import Svg, { Path } from 'react-native-svg';

// ── Type label map ────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  jcc: 'JCC',
  non_profit: 'Non-profit',
  creator: 'Creator',
  community: 'Community',
  business: 'Business',
};

type OrgInfo = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  iconUrl: string | null;
  memberCount: number;
  isMember: boolean;
  role: 'admin' | 'moderator' | 'member' | null;
};

function BackIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ActionRow({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.7 : 1 }]}
      hitSlop={4}
    >
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      <Text style={[styles.actionChevron, { color }]}>›</Text>
    </Pressable>
  );
}

export default function OrgScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUser = useAuthStore((s) => s.user);
  const refreshSession = useAuthStore((s) => s.refreshSession);

  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<'not_found' | 'network' | null>(null);
  const [leavingOrg, setLeavingOrg] = useState(false);

  const fetchOrg = useCallback(async () => {
    setError(null);
    try {
      const res = await orgsApi.getBySlug(String(slug));
      setOrg(res.org as OrgInfo);
    } catch (err: unknown) {
      console.error('[org/slug] fetch failed', err);
      const status = (err as { status?: number })?.status;
      setError(status === 404 ? 'not_found' : 'network');
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    orgsApi.getBySlug(String(slug))
      .then((res) => {
        if (cancelled) return;
        setOrg(res.org as OrgInfo);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[org/slug] initial fetch failed', err);
        const status = (err as { status?: number })?.status;
        setError(status === 404 ? 'not_found' : 'network');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrg();
    setRefreshing(false);
  }, [fetchOrg]);

  const handleLeave = useCallback(() => {
    if (!org || !authUser) return;
    Alert.alert(
      'Leave organization?',
      `You will lose access to ${org.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeavingOrg(true);
            try {
              await orgsApi.removeMember(org.id, authUser.id);
              await refreshSession();
              router.replace('/(app)/profile');
            } catch (err: unknown) {
              setLeavingOrg(false);
              const status = (err as { status?: number })?.status;
              if (status === 422) {
                Alert.alert(
                  "Can't leave",
                  `You're the only admin of ${org.name}. Promote another member to admin first, or contact our team.`,
                  [{ text: 'OK' }],
                );
              } else {
                Alert.alert('Error', 'Could not leave the organization. Please try again.');
              }
            }
          },
        },
      ],
    );
  }, [org, authUser, refreshSession, router]);

  // ── Loading ────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </SafeAreaView>
    );
  }

  // ── Error: network ─────────────────────────────────────
  if (error === 'network') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
        <GlassCard>
          <View style={styles.errorInner}>
            <Text style={[styles.errorTitle, { color: colors.text }]}>Could not load</Text>
            <Text style={[styles.errorBody, { color: colors.textMuted }]}>
              Check your connection and try again.
            </Text>
            <PillButton title="Retry" onPress={() => { setLoading(true); fetchOrg().finally(() => setLoading(false)); }} variant="outline" size="sm" />
          </View>
        </GlassCard>
      </SafeAreaView>
    );
  }

  // ── Error: 404 ─────────────────────────────────────────
  if (error === 'not_found' || !org) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceGlass }]}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <BackIcon color={colors.text} />
        </Pressable>
        <View style={{ paddingHorizontal: SPACING.page, width: '100%' }}>
          <GlassCard>
            <View style={styles.errorInner}>
              <Text style={[styles.errorTitle, { color: colors.text }]}>Organization not found</Text>
              <Text style={[styles.errorBody, { color: colors.textMuted }]}>
                This link may be expired or the organization may no longer exist.
              </Text>
              <PillButton title="Go back" onPress={() => router.back()} variant="outline" size="sm" />
            </View>
          </GlassCard>
        </View>
      </SafeAreaView>
    );
  }

  const memberCountLabel = org.memberCount === 1 ? '1 member' : `${org.memberCount} members`;
  const typeLabel = TYPE_LABEL[org.type] ?? org.type;

  // ── Hero (shared across states) ────────────────────────
  const hero = (
    <View style={styles.hero}>
      {org.iconUrl ? (
        <Image source={{ uri: org.iconUrl }} style={styles.heroIcon} accessibilityLabel={org.name} />
      ) : (
        <AvatarCircle name={org.name} size={80} showRing={false} />
      )}
      <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={2}>
        {org.name}
      </Text>
      <View style={styles.heroBadges}>
        <GlowBadge text={typeLabel} color={COLORS.primary} size="sm" />
        {org.isMember && org.role && (
          <RoleBadge role={org.role} size="sm" />
        )}
      </View>
      <Text style={[styles.heroMemberCount, { color: colors.textMuted }]}>{memberCountLabel}</Text>
    </View>
  );

  // ── State A: Anonymous ─────────────────────────────────
  if (!isAuthenticated) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceGlass }]}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <BackIcon color={colors.text} />
        </Pressable>

        <AnimatedEntry>
          {hero}
        </AnimatedEntry>

        <AnimatedEntry delay={60}>
          <GlassCard>
            <View style={styles.stateCardInner}>
              <Text style={[styles.stateCardTitle, { color: colors.text }]}>Sign in to view</Text>
              <Text style={[styles.stateCardBody, { color: colors.textMuted }]}>
                Join TribeLife to discover this organization and others like it.
              </Text>
              <PillButton
                title="Sign in"
                onPress={() => router.push('/(auth)/welcome')}
                variant="primary"
                style={{ width: '100%' }}
              />
            </View>
          </GlassCard>
        </AnimatedEntry>
      </ScrollView>
      </SafeAreaView>
    );
  }

  // ── State B: Authenticated, non-member ─────────────────
  if (!org.isMember) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
      >
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceGlass }]}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <BackIcon color={colors.text} />
        </Pressable>

        <AnimatedEntry>
          {hero}
        </AnimatedEntry>

        <AnimatedEntry delay={60}>
          <GlassCard>
            <View style={styles.stateCardInner}>
              <Text style={[styles.stateCardTitle, { color: colors.text }]}>Invite-only</Text>
              <Text style={[styles.stateCardBody, { color: colors.textMuted }]}>
                This organization is invite-only. Ask an admin for an invite link to join.
              </Text>
            </View>
          </GlassCard>
        </AnimatedEntry>
      </ScrollView>
      </SafeAreaView>
    );
  }

  // ── State C: Authenticated member ─────────────────────
  const isAdmin = org.role === 'admin';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: SPACING['2xl'] }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
    >
      <Pressable
        onPress={() => router.back()}
        style={[styles.backButton, { backgroundColor: colors.surfaceGlass }]}
        hitSlop={8}
        accessibilityLabel="Go back"
      >
        <BackIcon color={colors.text} />
      </Pressable>

      <AnimatedEntry>
        {hero}
      </AnimatedEntry>

      {/* About */}
      {!!org.description && (
        <AnimatedEntry delay={60}>
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>About</Text>
            <GlassCard>
              <Text style={[styles.descriptionText, { color: colors.textMuted }]}>
                {org.description}
              </Text>
            </GlassCard>
          </View>
        </AnimatedEntry>
      )}

      {/* Manage (admin only) */}
      {isAdmin && (
        <AnimatedEntry delay={90}>
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.text }]}>Manage</Text>
            <GlassCard>
              <ActionRow
                label="Manage members"
                color={colors.text}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/org/${slug}/members`);
                }}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ActionRow
                label="Invite people"
                color={colors.text}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/org/${slug}/invite`);
                }}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ActionRow
                label="Edit organization"
                color={colors.text}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/org/${slug}/edit`);
                }}
              />
            </GlassCard>
          </View>
        </AnimatedEntry>
      )}

      {/* Leave */}
      <AnimatedEntry delay={isAdmin ? 120 : 90}>
        <PillButton
          title="Leave organization"
          onPress={handleLeave}
          variant="outline"
          textStyle={{ color: COLORS.error }}
          style={{ borderColor: COLORS.error, marginTop: SPACING.lg } as object}
          loading={leavingOrg}
          disabled={leavingOrg}
        />
      </AnimatedEntry>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
    gap: SPACING.md,
  },
  scrollContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.xl,
    gap: SPACING.lg,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  hero: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.pill,
  },
  heroName: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 34,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  heroMemberCount: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  stateCardInner: {
    gap: SPACING.md,
  },
  stateCardTitle: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    letterSpacing: -0.2,
  },
  stateCardBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionHeader: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  actionLabel: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  actionChevron: {
    fontSize: 20,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginHorizontal: -SPACING.md,
  },
  errorInner: {
    gap: SPACING.md,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
});
