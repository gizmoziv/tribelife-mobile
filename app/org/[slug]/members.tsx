import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
  ActionSheetIOS,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { orgsApi } from '@/services/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { LighthouseIcon } from '@/components/ui/LighthouseIcon';
import { FONTS, SPACING, COLORS, RADIUS } from '@/constants';
import type { OrgRole } from '@/types/capabilities';

// ── Types ─────────────────────────────────────────────────────────────────────

type Member = {
  userId: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  role: OrgRole;
  joinedAt: string;
};

type OrgData = {
  id: number;
  name: string;
  role: OrgRole | null;
};

type ActionInProgress = { userId: number } | null;

// ── Action sheet helper ───────────────────────────────────────────────────────

interface ActionItem {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

function showActionSheet(options: { title?: string; actions: ActionItem[] }) {
  const labels = options.actions.map((a) => a.label).concat(['Cancel']);
  const destructiveIndex = options.actions.findIndex((a) => a.destructive);
  const cancelIndex = labels.length - 1;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: labels,
        cancelButtonIndex: cancelIndex,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        title: options.title,
      },
      (idx) => {
        if (idx >= 0 && idx < options.actions.length) {
          options.actions[idx].onPress();
        }
      },
    );
  } else {
    Alert.alert(
      options.title ?? 'Actions',
      undefined,
      [
        ...options.actions.map((a) => ({
          text: a.label,
          style: a.destructive ? ('destructive' as const) : undefined,
          onPress: a.onPress,
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MembersScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const currentUserId = useAuthStore((s) => s.user?.id);

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
        setOrgError(err?.status === 404 ? 'not_found' : 'error');
      })
      .finally(() => setOrgLoading(false));
  }, [slug]);

  // ── Members list ─────────────────────────────────────────────────────────────
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchMembers = useCallback((orgId: number) => {
    setMembersLoading(true);
    orgsApi.members(orgId)
      .then(({ members: list }) => setMembers(list as Member[]))
      .catch(() => Alert.alert("Couldn't load members. Please try again."))
      .finally(() => setMembersLoading(false));
  }, []);

  useEffect(() => {
    if (org?.id && org.role === 'admin') {
      fetchMembers(org.id);
    }
  }, [org, fetchMembers]);

  // ── Action tracking ───────────────────────────────────────────────────────────
  const [actionInProgress, setActionInProgress] = useState<ActionInProgress>(null);

  // ── Promote ───────────────────────────────────────────────────────────────────
  const handlePromote = useCallback(async (member: Member) => {
    if (!org) return;
    const prevRole = member.role;
    // Optimistic update
    setMembers((list) => list.map((m) => m.userId === member.userId ? { ...m, role: 'moderator' as OrgRole } : m));
    setActionInProgress({ userId: member.userId });
    try {
      await orgsApi.updateMemberRole(org.id, member.userId, 'moderator');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Show toast inline via Alert (simpler)
      Alert.alert(`Promoted @${member.handle} to moderator`);
    } catch {
      // Rollback
      setMembers((list) => list.map((m) => m.userId === member.userId ? { ...m, role: prevRole } : m));
      Alert.alert("Couldn't update role. Please try again.");
    } finally {
      setActionInProgress(null);
    }
  }, [org]);

  // ── Demote ────────────────────────────────────────────────────────────────────
  const handleDemoteConfirm = useCallback(async (member: Member) => {
    if (!org) return;
    const prevRole = member.role;
    // Optimistic update
    setMembers((list) => list.map((m) => m.userId === member.userId ? { ...m, role: 'member' as OrgRole } : m));
    setActionInProgress({ userId: member.userId });
    try {
      await orgsApi.updateMemberRole(org.id, member.userId, 'member');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      // Rollback
      setMembers((list) => list.map((m) => m.userId === member.userId ? { ...m, role: prevRole } : m));
      const errMsg = err?.data?.error ?? '';
      if (err?.status === 422 || errMsg.toLowerCase().includes('last admin')) {
        Alert.alert(
          "Can't demote",
          `${org.name} needs at least one admin. Promote another member to admin first.`,
        );
      } else {
        Alert.alert("Couldn't update role. Please try again.");
      }
    } finally {
      setActionInProgress(null);
    }
  }, [org]);

  const handleDemote = useCallback((member: Member) => {
    Alert.alert(
      `Demote @${member.handle}?`,
      "They'll no longer have the moderator label.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Demote', style: 'destructive', onPress: () => handleDemoteConfirm(member) },
      ],
    );
  }, [handleDemoteConfirm]);

  // ── Remove ────────────────────────────────────────────────────────────────────
  const handleRemoveConfirm = useCallback(async (member: Member) => {
    if (!org) return;
    const snapshot = [...members];
    // Optimistic update
    setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
    setActionInProgress({ userId: member.userId });
    try {
      await orgsApi.removeMember(org.id, member.userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      // Rollback
      setMembers(snapshot);
      const errMsg = err?.data?.error ?? '';
      if (err?.status === 422 || errMsg.toLowerCase().includes('last admin')) {
        Alert.alert(
          "Can't demote",
          `${org.name} needs at least one admin. Promote another member to admin first.`,
        );
      } else {
        Alert.alert("Couldn't remove member. Please try again.");
      }
    } finally {
      setActionInProgress(null);
    }
  }, [org, members]);

  const handleRemove = useCallback((member: Member) => {
    if (!org) return;
    Alert.alert(
      `Remove @${member.handle}?`,
      `They'll lose access to ${org.name}. They can be invited again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleRemoveConfirm(member) },
      ],
    );
  }, [org, handleRemoveConfirm]);

  // ── Action sheet ──────────────────────────────────────────────────────────────
  const handleMemberAction = useCallback((member: Member) => {
    if (!org) return;
    const actions: ActionItem[] = [];

    if (member.role === 'member') {
      actions.push({ label: 'Promote to moderator', onPress: () => handlePromote(member) });
      actions.push({ label: `Remove from ${org.name}`, destructive: true, onPress: () => handleRemove(member) });
    } else if (member.role === 'moderator') {
      actions.push({ label: 'Demote to member', onPress: () => handleDemote(member) });
      actions.push({ label: `Remove from ${org.name}`, destructive: true, onPress: () => handleRemove(member) });
    } else if (member.role === 'admin') {
      // Other admin: demote only (no remove per D-05)
      actions.push({ label: 'Demote to member', onPress: () => handleDemote(member) });
    }

    showActionSheet({ title: `@${member.handle}`, actions });
  }, [org, handlePromote, handleDemote, handleRemove]);

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
            Only admins can manage members.
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

  // ── Shared header bar ─────────────────────────────────────────────────────────
  const headerBar = (
    <View style={[styles.headerBar, { borderBottomColor: colors.border }]}>
      <Pressable
        onPress={() => router.back()}
        style={styles.headerBack}
        accessibilityLabel="Go back"
        hitSlop={8}
      >
        <Text style={[styles.headerBackText, { color: colors.primary }]}>‹</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Members of {org.name}</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  // ── Empty state (solo admin) ──────────────────────────────────────────────────
  // Tightened: require list fully loaded, exactly 1 member, that member is an
  // admin, and that member is the current user — avoids flash during initial
  // load (members=[], membersLoading=false before fetchMembers fires) and
  // avoids incorrect empty-state for non-admin viewing as the only member.
  const isSoloAdmin =
    !membersLoading &&
    members.length === 1 &&
    members[0]?.role === 'admin' &&
    members[0]?.userId === currentUserId;

  if (isSoloAdmin) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
        {headerBar}
        <View style={styles.centered}>
          <LighthouseIcon color={colors.textMuted} size={48} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            You're the first one here
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Invite people to grow {org.name}.
          </Text>
          <PillButton
            title="Invite people"
            onPress={() => router.push(`/org/${slug}/invite` as any)}
            style={{ marginTop: SPACING.lg }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Main list ─────────────────────────────────────────────────────────────────

  const renderMember = ({ item }: { item: Member }) => {
    const isSelf = item.userId === currentUserId;
    const isActing = actionInProgress?.userId === item.userId;

    return (
      <View
        style={[
          styles.memberRow,
          { borderBottomColor: colors.border },
        ]}
      >
        <AvatarCircle
          name={item.name || item.handle}
          imageUrl={item.avatarUrl ?? undefined}
          size={44}
          showRing={false}
        />
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.memberHandle, { color: colors.textMuted }]}>
            @{item.handle}
          </Text>
        </View>
        <RoleBadge role={item.role} size="sm" />

        {isSelf ? (
          <Text style={[styles.youLabel, { color: colors.textMuted }]}>[You]</Text>
        ) : isActing ? (
          <ActivityIndicator color={COLORS.primary} size="small" style={styles.actionSpinner} />
        ) : (
          <Pressable
            onPress={() => handleMemberAction(item)}
            hitSlop={8}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`Member actions for @${item.handle}`}
          >
            <Text style={[styles.dotsGlyph, { color: colors.textMuted }]}>⋯</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      {headerBar}
      <View style={{ paddingHorizontal: SPACING.page, paddingTop: SPACING.sm }}>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {members.length} members
        </Text>
      </View>

      {membersLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => String(item.userId)}
          renderItem={renderMember}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: SPACING.page },
          ]}
          style={{ flex: 1 }}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  subtitle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.md,
  },
  listContent: {
    paddingBottom: SPACING['2xl'],
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
    minHeight: 44,
  },
  separator: {
    height: 1,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  memberHandle: {
    fontSize: 13,
    fontFamily: FONTS.regular,
  },
  youLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    marginLeft: SPACING.xs,
  },
  actionButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsGlyph: {
    fontSize: 18,
    fontFamily: FONTS.bold,
  },
  actionSpinner: {
    width: 28,
    height: 28,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: SPACING.sm,
    textAlign: 'center',
    lineHeight: 20,
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
