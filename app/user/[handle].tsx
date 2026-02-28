import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { usersApi, chat } from '@/services/api';
import { FONTS, COLORS } from '@/constants';
import type { PublicProfile } from '@/types';

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user: currentUser } = useAuthStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingConvo, setIsStartingConvo] = useState(false);

  useEffect(() => {
    if (handle) {
      navigation.setOptions({ title: `@${handle}` });
      usersApi.getProfile(handle).then(({ user }) => {
        setProfile(user);
        setIsLoading(false);
      }).catch(() => setIsLoading(false));
    }
  }, [handle]);

  const handleStartConversation = async () => {
    if (!profile) return;
    setIsStartingConvo(true);
    try {
      const { conversationId } = await chat.getOrCreateConversation(profile.id);
      router.replace({
        pathname: '/(app)/chat/[conversationId]',
        params: { conversationId: conversationId.toString(), handle: profile.handle },
      });
    } catch {
      Alert.alert('Error', 'Could not start conversation. Please try again.');
    } finally {
      setIsStartingConvo(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted, fontFamily: FONTS.medium }}>User not found</Text>
      </View>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Avatar */}
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.avatarText}>{profile.name[0]?.toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{profile.name}</Text>
          <Text style={[styles.handle, { color: COLORS.primary }]}>@{profile.handle}</Text>

          {profile.isPremium && (
            <View style={[styles.premiumBadge, { backgroundColor: COLORS.accent + '22' }]}>
              <Text style={[styles.premiumText, { color: COLORS.accent }]}>✨ Premium Member</Text>
            </View>
          )}
        </View>

        {/* Meta info */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {profile.timezone && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Timezone</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{profile.timezone}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Member since</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
            </Text>
          </View>
        </View>

        {/* CTA */}
        {!isOwnProfile && (
          <TouchableOpacity
            style={[styles.messageButton, { opacity: isStartingConvo ? 0.7 : 1 }]}
            onPress={handleStartConversation}
            disabled={isStartingConvo}
          >
            {isStartingConvo ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.messageButtonText}>💬 Send a Message</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, gap: 16 },
  header: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 32, fontFamily: FONTS.bold },
  name: { fontSize: 24, fontFamily: FONTS.bold, marginTop: 4 },
  handle: { fontSize: 16, fontFamily: FONTS.semiBold },
  premiumBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  premiumText: { fontSize: 13, fontFamily: FONTS.semiBold },
  infoCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: { fontSize: 14, fontFamily: FONTS.medium },
  infoValue: { fontSize: 14, fontFamily: FONTS.regular },
  messageButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  messageButtonText: { color: '#FFF', fontSize: 16, fontFamily: FONTS.semiBold },
});
