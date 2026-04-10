import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { groupsApi } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import type { GroupMember } from '@/types';
import Svg, { Path } from 'react-native-svg';

export default function GroupInfoScreen() {
  const { conversationId: rawId, groupName: rawGroupName, inviteSlug: rawSlug } = useLocalSearchParams<{
    conversationId: string;
    groupName?: string;
    inviteSlug?: string;
  }>();
  const conversationId = parseInt(rawId);
  const [groupName, setGroupName] = useState(rawGroupName ?? '');
  const inviteSlug = rawSlug ?? '';
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const router = useRouter();

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  const currentMember = members.find((m) => m.userId === user?.id);
  const isAdmin = currentMember?.role === 'admin';

  useEffect(() => {
    groupsApi.members(conversationId).then(({ members: m }) => {
      setMembers(m);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [conversationId]);

  const handleRename = useCallback(() => {
    Alert.prompt(
      'Rename Group',
      'Enter a new name for this group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (newName?: string) => {
            const trimmed = newName?.trim();
            if (!trimmed || trimmed === groupName) return;
            try {
              await groupsApi.update(conversationId, { name: trimmed });
              setGroupName(trimmed);
            } catch {
              Alert.alert('Error', 'Could not rename the group.');
            }
          },
        },
      ],
      'plain-text',
      groupName,
    );
  }, [conversationId, groupName]);

  const handleShare = useCallback(async () => {
    // We need the invite slug — find it from conversation list or use a fallback
    try {
      const url = `https://tribelife.app/g/${inviteSlug}`;
      await Share.share({
        message: `Join our group on TribeLife!\n${url}`,
      });
    } catch { /* user cancelled */ }
  }, [inviteSlug]);

  const handleKick = useCallback((memberId: number, memberHandle: string) => {
    Alert.alert(
      'Remove Member',
      `Remove @${memberHandle} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupsApi.kickMember(conversationId, memberId);
              setMembers((prev) => prev.filter((m) => m.userId !== memberId));
            } catch {
              Alert.alert('Error', 'Failed to remove member.');
            }
          },
        },
      ]
    );
  }, [conversationId]);

  const handleLeave = useCallback(() => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group? You can rejoin with an invite link.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsLeaving(true);
            try {
              await groupsApi.leave(conversationId);
              router.replace('/(app)/chat');
            } catch {
              Alert.alert('Error', 'Failed to leave group.');
              setIsLeaving(false);
            }
          },
        },
      ]
    );
  }, [conversationId]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/chat');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Group Info</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Group Overview */}
        <AnimatedEntry>
          <GlassCard>
            <View style={styles.overviewInner}>
              <AvatarCircle name="G" size={64} />
              <Text style={[styles.groupName, { color: colors.text }]}>{groupName || 'Group Chat'}</Text>
              <Text style={[styles.memberCountText, { color: colors.textMuted }]}>
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </Text>
              {isAdmin && (
                <TouchableOpacity onPress={handleRename} style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 14, fontFamily: FONTS.semiBold, color: COLORS.primary }}>
                    Rename Group
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </GlassCard>
        </AnimatedEntry>

        {/* Invite Link */}
        <AnimatedEntry delay={60}>
          <GlassCard>
            <View style={styles.inviteSection}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Invite Link</Text>
              <PillButton
                title="Share Invite Link"
                onPress={handleShare}
                variant="primary"
                style={{ width: '100%' }}
              />
            </View>
          </GlassCard>
        </AnimatedEntry>

        {/* Members */}
        <AnimatedEntry delay={120}>
          <View style={styles.membersSection}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              MEMBERS ({members.length})
            </Text>
            <GlassCard>
              {members.map((member, index) => (
                <View
                  key={member.userId}
                  style={[
                    styles.memberRow,
                    { borderBottomColor: colors.border },
                    index === members.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.memberInfo}
                    onPress={() => router.push(`/user/${member.handle}`)}
                    activeOpacity={0.7}
                  >
                    <AvatarCircle
                      name={member.name ?? '?'}
                      size={36}
                      showRing={false}
                      imageUrl={member.avatarUrl ?? undefined}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>
                        @{member.handle}
                      </Text>
                      {member.role === 'admin' && (
                        <Text style={[styles.roleText, { color: COLORS.accent }]}>Admin</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  {isAdmin && member.userId !== user?.id && (
                    <TouchableOpacity
                      onPress={() => handleKick(member.userId, member.handle)}
                      style={styles.kickButton}
                    >
                      <Text style={[styles.kickText, { color: COLORS.error }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </GlassCard>
          </View>
        </AnimatedEntry>

        {/* Leave Group */}
        <AnimatedEntry delay={180}>
          <View style={styles.leaveSection}>
            <PillButton
              title="Leave Group"
              onPress={handleLeave}
              variant="ghost"
              size="md"
              loading={isLeaving}
              disabled={isLeaving}
              style={{ width: '100%', backgroundColor: COLORS.error }}
              textStyle={{ color: '#FFF' }}
            />
          </View>
        </AnimatedEntry>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  scroll: {
    padding: SPACING.page,
    gap: SPACING.sm,
    paddingBottom: SPACING['2xl'],
  },
  overviewInner: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  groupName: {
    fontSize: 20,
    fontFamily: FONTS.semiBold,
  },
  memberCountText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  inviteSection: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  membersSection: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1,
    paddingLeft: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontFamily: FONTS.medium,
  },
  roleText: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    marginTop: 1,
  },
  kickButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  kickText: {
    fontSize: 13,
    fontFamily: FONTS.semiBold,
  },
  leaveSection: {
    marginTop: SPACING.md,
  },
});
