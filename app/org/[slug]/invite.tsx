import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { orgsApi, usersApi } from '@/services/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillToggle } from '@/components/ui/PillToggle';
import { PillButton } from '@/components/ui/PillButton';
import { GlassInput } from '@/components/ui/GlassInput';
import { InviteTokenBox } from '@/components/ui/InviteTokenBox';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { FONTS, SPACING, COLORS } from '@/constants';
import type { PublicProfile } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgData = {
  id: number;
  name: string;
  role: 'admin' | 'moderator' | 'member' | null;
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function InviteScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const currentHandle = useAuthStore((s) => s.user?.handle);

  // ── Org loading ─────────────────────────────────────────────────────────────
  const [org, setOrg] = useState<OrgData | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<'not_found' | 'error' | null>(null);

  useEffect(() => {
    if (!slug) return;
    setOrgLoading(true);
    orgsApi.getBySlug(slug)
      .then(({ org: o }) => {
        setOrg({ id: o.id, name: o.name, role: o.role });
      })
      .catch((err) => {
        if (err?.status === 404) {
          setOrgError('not_found');
        } else {
          setOrgError('error');
        }
      })
      .finally(() => setOrgLoading(false));
  }, [slug]);

  // ── Path toggle (0 = handle, 1 = link) ─────────────────────────────────────
  const [pathIndex, setPathIndex] = useState(0);

  // ── Path A state ─────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const runSearch = useCallback((q: string) => {
    if (q.length < 3) {
      setResult(null);
      setNotFound(false);
      return;
    }
    setSearching(true);
    usersApi.searchByHandle(q)
      .then(({ users }) => {
        if (users.length > 0) {
          setResult(users[0]);
          setNotFound(false);
        } else {
          setResult(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        setResult(null);
        setNotFound(true);
      })
      .finally(() => setSearching(false));
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setResult(null);
    setNotFound(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(text), 600);
  };

  const handleSendInvite = async () => {
    if (!result || !org) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    try {
      await orgsApi.invite(org.id, { invitedHandle: result.handle });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const sentHandle = result.handle;
      setQuery('');
      setResult(null);
      setNotFound(false);
      showToast(`Invite sent to @${sentHandle}`);
    } catch (err: any) {
      const status = err?.status;
      const errMsg = err?.data?.error ?? '';
      if (status === 422 && errMsg.toLowerCase().includes('yourself')) {
        Alert.alert("You can't invite yourself.");
      } else if (status === 404) {
        Alert.alert('No user with that handle.');
      } else {
        Alert.alert("Couldn't send invite. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  // ── Path B state ─────────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    if (!org) return;
    setGenerating(true);
    try {
      const { invite } = await orgsApi.invite(org.id);
      const url = `https://tribelife.app/org/invite/${invite.token}`;
      setTokenUrl(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Couldn't generate invite link. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateLink = () => {
    setTokenUrl(null);
  };

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (orgLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (orgError === 'not_found') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Organization not found.</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backLink, { color: COLORS.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (orgError === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong.</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backLink, { color: COLORS.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // 403 fallback — non-admin arrived via deep link
  if (!org || org.role !== 'admin') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <GlassCard style={styles.forbiddenCard}>
          <Text style={[styles.forbiddenText, { color: colors.text }]}>
            Only admins can invite to this organization.
          </Text>
          <PillButton
            title="Go back"
            variant="outline"
            size="sm"
            onPress={() => router.back()}
            style={{ marginTop: SPACING.md }}
          />
        </GlassCard>
      </View>
    );
  }

  const shareMessage = `${currentHandle ?? 'Someone'} invited you to join ${org.name} on TribeLife`;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: SPACING.page }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={[styles.header, { color: colors.text }]}>
          Invite to {org.name}
        </Text>

        {/* Toast */}
        {toastMsg && (
          <View style={[styles.toast, { backgroundColor: COLORS.success }]}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        )}

        {/* Path toggle */}
        <PillToggle
          options={['Search by handle', 'Shareable link']}
          activeIndex={pathIndex}
          onSelect={setPathIndex}
          style={{ marginBottom: SPACING.lg }}
        />

        {/* ── Path A ── */}
        {pathIndex === 0 && (
          <GlassCard style={styles.card}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Search by handle
            </Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              Send an invite directly to a TribeLife user. They'll get a notification and a push.
            </Text>

            {/* Handle input */}
            <View style={styles.inputRow}>
              <GlassInput
                value={query}
                onChangeText={handleQueryChange}
                placeholder="Search by handle"
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1 }}
                containerStyle={{ flex: 1 }}
              />
              {searching && (
                <ActivityIndicator
                  color={COLORS.primary}
                  size="small"
                  style={styles.inputSpinner}
                />
              )}
            </View>

            {/* States below input */}
            {query.length > 0 && query.length < 3 && (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                Keep typing…
              </Text>
            )}

            {notFound && !searching && (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                No user with that handle
              </Text>
            )}

            {result && !searching && (
              <View style={styles.resultRow}>
                <AvatarCircle
                  name={result.name || result.handle}
                  imageUrl={result.avatarUrl ?? undefined}
                  size={36}
                  showRing={false}
                />
                <View style={styles.resultInfo}>
                  <Text style={[styles.resultHandle, { color: colors.text }]}>
                    @{result.handle}
                  </Text>
                  <Text style={[styles.resultName, { color: colors.textMuted }]}>
                    {result.name}
                  </Text>
                </View>
                <PillButton
                  title="Send invite"
                  size="sm"
                  loading={sending}
                  onPress={handleSendInvite}
                />
              </View>
            )}
          </GlassCard>
        )}

        {/* ── Path B ── */}
        {pathIndex === 1 && (
          <GlassCard style={styles.card}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Shareable link
            </Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>
              Anyone with this link can join — share it only with people you trust.
            </Text>

            {!tokenUrl ? (
              <PillButton
                title="Generate invite link"
                loading={generating}
                onPress={handleGenerateLink}
                style={{ marginTop: SPACING.sm }}
              />
            ) : (
              <View style={styles.linkSection}>
                <InviteTokenBox
                  url={tokenUrl}
                  shareMessage={shareMessage}
                  onCopy={() => showToast('Link copied')}
                />
                <Text style={[styles.expiryText, { color: colors.textMuted }]}>
                  Expires in 30 days
                </Text>
                <PillButton
                  title="Generate a new link"
                  variant="ghost"
                  size="sm"
                  onPress={handleRegenerateLink}
                  style={{ marginTop: SPACING.xs }}
                />
              </View>
            )}
          </GlassCard>
        )}

        <View style={{ height: SPACING['2xl'] }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.page,
  },
  scroll: {
    paddingTop: SPACING.lg,
  },
  header: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.lg,
  },
  toast: {
    borderRadius: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  card: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    letterSpacing: -0.2,
  },
  cardBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inputSpinner: {
    position: 'absolute',
    right: SPACING.md,
  },
  helperText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: SPACING.xs,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  resultInfo: {
    flex: 1,
  },
  resultHandle: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  resultName: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  linkSection: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  expiryText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  forbiddenCard: {
    alignItems: 'center',
    padding: SPACING.lg,
  },
  forbiddenText: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.md,
  },
  backLink: {
    fontSize: 15,
    fontFamily: FONTS.medium,
  },
});
