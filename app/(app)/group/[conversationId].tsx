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
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { groupsApi } from '@/services/api';
import { requestGroupIconUploadUrl, uploadToSpaces, confirmGroupIconUpload } from '@/services/upload';
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
  const [groupIconUrl, setGroupIconUrl] = useState<string | null>(null);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);

  const currentMember = members.find((m) => m.userId === user?.id);
  const isAdmin = currentMember?.role === 'admin';

  useEffect(() => {
    groupsApi.members(conversationId).then(({ members: m }) => {
      setMembers(m);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [conversationId]);

  useEffect(() => {
    if (!inviteSlug) return;
    groupsApi.getInfo(inviteSlug)
      .then(({ group }) => setGroupIconUrl(group.groupIconUrl ?? null))
      .catch(() => {});
  }, [inviteSlug]);

  const handleUploadIcon = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library to upload a group icon.');
        return;
      }

      const pickResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (pickResult.canceled) return;

      setIsUploadingIcon(true);

      const processed = await manipulateAsync(
        pickResult.assets[0].uri,
        [{ resize: { width: 500, height: 500 } }],
        { compress: 0.8, format: SaveFormat.JPEG },
      );

      // Optimistic preview
      setGroupIconUrl(processed.uri);

      const { uploadUrl, key } = await requestGroupIconUploadUrl(conversationId);
      await uploadToSpaces(uploadUrl, processed.uri);
      const { groupIconUrl: cdnUrl } = await confirmGroupIconUpload(conversationId, key);
      setGroupIconUrl(cdnUrl);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Could not upload the group icon. Please try again.');
    } finally {
      setIsUploadingIcon(false);
    }
  }, [isAdmin, conversationId]);

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
              <TouchableOpacity
                onPress={handleUploadIcon}
                disabled={!isAdmin || isUploadingIcon}
                activeOpacity={isAdmin ? 0.7 : 1}
              >
                <View>
                  <AvatarCircle
                    name={groupName || 'G'}
                    size={72}
                    imageUrl={groupIconUrl ?? undefined}
                  />
                  {isAdmin && (
                    <View style={[styles.cameraBadge, { borderColor: colors.background }]}>
                      {isUploadingIcon ? (
                        <ActivityIndicator size={12} color="#fff" />
                      ) : (
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                          <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          <Path d="M12 17a4 4 0 100-8 4 4 0 000 8z" stroke="#fff" strokeWidth={2} />
                        </Svg>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
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
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
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
