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
import { SafeAreaView } from 'react-native-safe-area-context';
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

type SearchResult = PublicProfile & { alreadyMember?: boolean };

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [sendingUserId, setSendingUserId] = useState<number | null>(null);
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
      setResults([]);
      setNotFound(false);
      return;
    }
    setSearching(true);
    usersApi.searchByHandle(q, org?.id)
      .then(({ users }) => {
        setResults(users);
        setNotFound(users.length === 0);
      })
      .catch(() => {
        setResults([]);
        setNotFound(true);
      })
      .finally(() => setSearching(false));
  }, [org?.id]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setResults([]);
    setNotFound(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(text), 600);
  };

  const handle403 = () => {
    Alert.alert(
      'Access removed',
      "You're no longer an admin of this organization. Returning to the org page.",
      [{ text: 'OK', onPress: () => router.replace(`/org/${slug}`) }],
    );
  };

  const handleSendInvite = async (target: SearchResult) => {
    if (!org) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSendingUserId(target.id);
    try {
      await orgsApi.invite(org.id, { invitedHandle: target.handle });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Invite sent to @${target.handle}`);
      setResults((prev) => prev.filter((u) => u.id !== target.id));
    } catch (err: any) {
      const status = err?.status;
      const errMsg = err?.data?.error ?? '';
      if (status === 403) {
        handle403();
      } else if (status === 422 && errMsg.toLowerCase().includes('yourself')) {
        Alert.alert("You can't invite yourself.");
      } else if (status === 404) {
        Alert.alert('No user with that handle.');
      } else {
        Alert.alert("Couldn't send invite. Please try again.");
      }
    } finally {
      setSendingUserId(null);
    }
  };

  // ── Path B state ─────────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);

  const handleGenerateLink = async (rotate = false) => {
    if (!org) return;
    setGenerating(true);
    try {
      const { invite } = await orgsApi.invite(org.id, rotate ? { rotate: true } : undefined);
      const url = `https://tribelife.app/org/invite/${invite.token}`;
      setTokenUrl(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (err?.status === 403) {
        handle403();
      } else {
        Alert.alert("Couldn't generate invite link. Please try again.");
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateLink = () => {
    setTokenUrl(null);
    handleGenerateLink(true);
  };

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (orgLoading) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (orgError === 'not_found') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Organization not found.</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backLink, { color: COLORS.primary }]}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (orgError === 'error') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong.</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backLink, { color: COLORS.primary }]}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // 403 fallback — non-admin arrived via deep link
  if (!org || org.role !== 'admin') {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.centered, { backgroundColor: colors.background }]}>
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
      </SafeAreaView>
    );
  }

  const shareMessage = `${currentHandle ?? 'Someone'} invited you to join ${org.name} on TribeLife`;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Text style={[styles.headerBackText, { color: colors.primary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Invite to {org.name}</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: SPACING.page }]}
        keyboardShouldPersistTaps="handled"
      >

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

            {query.length >= 3 && !searching && results.length === 0 && notFound && (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                No user with that handle
              </Text>
            )}

            {!searching && results.length > 0 && (
              <View style={styles.resultsList}>
                {results.map((u) => (
                  <View key={u.id} style={styles.resultRow}>
                    <AvatarCircle
                      name={u.name || u.handle}
                      imageUrl={u.avatarUrl ?? undefined}
                      size={36}
                      showRing={false}
                    />
                    <View style={styles.resultInfo}>
                      <Text style={[styles.resultHandle, { color: colors.text }]}>
                        @{u.handle}
                      </Text>
                      <Text style={[styles.resultName, { color: colors.textMuted }]}>
                        {u.name}
                      </Text>
                    </View>
                    {u.alreadyMember ? (
                      <View style={[styles.memberBadge, { backgroundColor: colors.border }]}>
                        <Text style={[styles.memberBadgeText, { color: colors.textMuted }]}>
                          Member
                        </Text>
                      </View>
                    ) : (
                      <PillButton
                        title="Send invite"
                        size="sm"
                        loading={sendingUserId === u.id}
                        onPress={() => handleSendInvite(u)}
                      />
                    )}
                  </View>
                ))}
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
                onPress={() => handleGenerateLink()}
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
                <Text style={[styles.reuseHint, { color: colors.textMuted }]}>
                  This link stays the same until you regenerate it.
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.page,
  },
  headerBar: {
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
  scroll: {
    paddingTop: SPACING.lg,
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
    marginBottom: SPACING.sm,
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
    marginTop: SPACING.md,
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
  resultsList: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
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
  reuseHint: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    opacity: 0.7,
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
  memberBadge: {
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  memberBadgeText: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
});
