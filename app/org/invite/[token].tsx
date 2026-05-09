import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { orgsApi } from '@/services/api';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';

// ── Type label map ────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  jcc: 'JCC',
  non_profit: 'Non-profit',
  creator: 'Creator',
  community: 'Community',
  business: 'Business',
};

// ── Types ─────────────────────────────────────────────────
type PreviewInvite = {
  state: 'pending' | 'expired' | 'already_used' | 'already_member';
  org: {
    slug: string;
    name: string;
    type: string;
    iconUrl: string | null;
    description: string | null;
  };
  inviter: { handle: string; name: string } | null;
  expiresAt: string;
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'pending'; preview: PreviewInvite }
  | { kind: 'already_member'; preview: PreviewInvite }
  | { kind: 'expired'; preview: PreviewInvite }
  | { kind: 'not_found' };

// ── Screen ────────────────────────────────────────────────
export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshSession = useAuthStore((s) => s.refreshSession);

  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [accepting, setAccepting] = useState(false);

  // ── Auth gate ──────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace({
        pathname: '/(auth)/welcome',
        params: { redirect: `/org/invite/${token}` },
      });
      return;
    }

    // Fetch preview
    let cancelled = false;
    setView({ kind: 'loading' });

    orgsApi.previewInvite(String(token))
      .then((res) => {
        if (cancelled) return;
        const p = res.invite;
        if (p.state === 'pending') {
          setView({ kind: 'pending', preview: p });
        } else if (p.state === 'already_member') {
          setView({ kind: 'already_member', preview: p });
        } else if (p.state === 'expired' || p.state === 'already_used') {
          setView({ kind: 'expired', preview: p });
        } else {
          setView({ kind: 'not_found' });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          setView({ kind: 'not_found' });
        } else {
          Alert.alert('Network error', 'Could not load invite. Please check your connection and try again.');
          setView({ kind: 'not_found' });
        }
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, token]);

  // ── Handlers ───────────────────────────────────────────
  const handleAccept = async (preview: PreviewInvite) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setAccepting(true);
    try {
      await orgsApi.acceptInvite(String(token));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshSession();
      router.replace(`/org/${preview.org.slug}`);
    } catch (err: unknown) {
      setAccepting(false);
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        setView({ kind: 'already_member', preview });
      } else if (status === 410) {
        // Per Plan 05-02 task 3 the body carries { error, code: 'expired' | 'already_used' }
        setView({ kind: 'expired', preview });
      } else if (status === 404) {
        setView({ kind: 'not_found' });
      } else {
        Alert.alert("Couldn't accept invite.", 'Please try again.');
      }
    }
  };

  // D-06: client-only — DO NOT call backend; token stays valid for someone else
  const handleDecline = () => {
    router.back();
  };

  // ── Close button ───────────────────────────────────────
  const closeButton = (
    <Pressable
      onPress={() => router.back()}
      style={styles.closeButton}
      hitSlop={8}
      accessibilityLabel="Close"
    >
      <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
    </Pressable>
  );

  // ── Loading ────────────────────────────────────────────
  if (view.kind === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        {closeButton}
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  // ── State 4: not_found ─────────────────────────────────
  if (view.kind === 'not_found') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        {closeButton}
        <AnimatedEntry style={{ width: '100%', paddingHorizontal: SPACING.page }}>
          <View accessibilityViewIsModal>
            <GlassCard>
              <View style={styles.stateInner}>
                <Text
                  style={[styles.stateTitle, { color: colors.text }]}
                  accessibilityRole="header"
                >
                  Invalid invite link
                </Text>
                <Text style={[styles.stateBody, { color: colors.textMuted }]}>
                  This invite link may be broken or has been deleted. Check with the person who shared it.
                </Text>
                <PillButton
                  title="Got it"
                  onPress={handleDecline}
                  variant="primary"
                  style={{ width: '100%' }}
                />
              </View>
            </GlassCard>
          </View>
        </AnimatedEntry>
      </View>
    );
  }

  const preview = view.preview;
  const typeLabel = TYPE_LABEL[preview.org.type] ?? preview.org.type;

  // ── Hero (shared across states 1-3) ───────────────────
  const iconOpacity = view.kind === 'expired' ? 0.4 : 1;
  const hero = (
    <View style={styles.hero}>
      <View style={[styles.heroIconWrap, SHADOWS.glow(COLORS.accent) as object]}>
        {preview.org.iconUrl ? (
          <Image
            source={{ uri: preview.org.iconUrl }}
            style={[styles.heroIcon, { opacity: iconOpacity }]}
            accessibilityLabel={preview.org.name}
          />
        ) : (
          <View style={{ opacity: iconOpacity }}>
            <AvatarCircle name={preview.org.name} size={96} showRing={false} />
          </View>
        )}
      </View>

      {view.kind === 'pending' && (
        <Text
          style={[styles.heroTitle, { color: colors.text }]}
          accessibilityRole="header"
        >
          {`Join ${preview.org.name}?`}
        </Text>
      )}
      <GlowBadge text={typeLabel} color={COLORS.primary} size="sm" />
    </View>
  );

  // ── State 2: already_member ────────────────────────────
  if (view.kind === 'already_member') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}
      >
        {closeButton}

        <AnimatedEntry>
          {hero}
        </AnimatedEntry>

        <AnimatedEntry delay={60}>
          <View accessibilityViewIsModal>
            <GlassCard>
              <View style={styles.stateInner}>
                <Text
                  style={[styles.stateTitle, { color: colors.text }]}
                  accessibilityRole="header"
                >
                  You're already a member
                </Text>
                <Text style={[styles.stateBody, { color: colors.textMuted }]}>
                  {`You joined ${preview.org.name}.`}
                </Text>
                <PillButton
                  title="Open organization"
                  onPress={() => router.replace(`/org/${preview.org.slug}`)}
                  variant="primary"
                  style={{ width: '100%' }}
                />
              </View>
            </GlassCard>
          </View>
        </AnimatedEntry>
      </ScrollView>
    );
  }

  // ── State 3: expired ──────────────────────────────────
  if (view.kind === 'expired') {
    const expiredBody = preview.inviter
      ? `Ask ${preview.inviter.handle} for a new invite link.`
      : 'Ask an admin for a new invite.';

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}
      >
        {closeButton}

        <AnimatedEntry>
          {hero}
        </AnimatedEntry>

        <AnimatedEntry delay={60}>
          <View accessibilityViewIsModal>
            <GlassCard>
              <View style={styles.stateInner}>
                <Text
                  style={[styles.stateTitle, { color: colors.text }]}
                  accessibilityRole="header"
                >
                  This invite has expired
                </Text>
                <Text style={[styles.stateBody, { color: colors.textMuted }]}>
                  {expiredBody}
                </Text>
                <PillButton
                  title="Got it"
                  onPress={handleDecline}
                  variant="primary"
                  style={{ width: '100%' }}
                />
              </View>
            </GlassCard>
          </View>
        </AnimatedEntry>
      </ScrollView>
    );
  }

  // ── State 1: pending (happy path) ─────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: SPACING['2xl'] }]}
    >
      {closeButton}

      <AnimatedEntry>
        {hero}
      </AnimatedEntry>

      <AnimatedEntry delay={60}>
        <View accessibilityViewIsModal>
          <GlassCard>
            <View style={styles.stateInner}>
              {/* Inviter row */}
              {preview.inviter && (
                <View style={styles.inviterRow}>
                  <AvatarCircle name={preview.inviter.name} size={36} showRing={false} />
                  <View style={styles.inviterInfo}>
                    <Text style={[styles.inviterName, { color: colors.text }]}>
                      {`${preview.inviter.name} invited you`}
                    </Text>
                    <Text style={[styles.inviterHandle, { color: colors.textMuted }]}>
                      {`@${preview.inviter.handle} · admin`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Divider */}
              {preview.inviter && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}

              {/* Org details */}
              {!!preview.org.description && (
                <Text style={[styles.stateBody, { color: colors.textMuted }]}>
                  {preview.org.description}
                </Text>
              )}
            </View>
          </GlassCard>
        </View>
      </AnimatedEntry>

      {/* CTAs */}
      <AnimatedEntry delay={120}>
        <View style={styles.ctaStack}>
          <PillButton
            title="Accept invite"
            onPress={() => handleAccept(preview)}
            variant="accent"
            size="lg"
            loading={accepting}
            disabled={accepting}
            style={{ width: '100%' }}
          />
          <PillButton
            title="Decline"
            onPress={handleDecline}
            variant="ghost"
            size="lg"
            disabled={accepting}
            style={{ width: '100%' }}
          />
        </View>
      </AnimatedEntry>
    </ScrollView>
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  closeIcon: {
    fontSize: 16,
    fontFamily: FONTS.medium,
    lineHeight: 20,
  },
  hero: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  heroIconWrap: {
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.sm,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.xl,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 34,
  },
  stateInner: {
    gap: SPACING.md,
  },
  stateTitle: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  stateBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
  inviterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inviterInfo: {
    flex: 1,
    gap: 2,
  },
  inviterName: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  inviterHandle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  divider: {
    height: 1,
    marginHorizontal: -SPACING.md,
  },
  ctaStack: {
    gap: SPACING.sm,
  },
});
