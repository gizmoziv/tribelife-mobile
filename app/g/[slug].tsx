import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { groupsApi, getToken } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS } from '@/constants';

export default function GroupInviteScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slug = typeof rawSlug === 'string' ? rawSlug : '';
  const router = useRouter();
  const { colors } = useTheme();
  const [statusText, setStatusText] = useState('Loading group…');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!slug) {
        if (!cancelled) router.replace('/');
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          await AsyncStorage.setItem('pendingGroupSlug', slug);
          if (!cancelled) router.replace('/(auth)/welcome');
          return;
        }

        const { group } = await groupsApi.getInfo(slug);
        if (cancelled) return;

        if (group.isMember) {
          router.replace({
            pathname: '/(app)/chat/[conversationId]',
            params: {
              conversationId: group.id.toString(),
              isGroup: 'true',
              groupName: group.groupName,
              inviteSlug: group.inviteSlug,
            },
          });
          return;
        }

        // Leave the dead /g/:slug route before prompting so the back stack is clean
        router.replace('/(app)/chat');

        Alert.alert(
          'Join Group',
          `Join "${group.groupName}" (${group.memberCount} members)?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Join',
              onPress: async () => {
                try {
                  const { conversation } = await groupsApi.join(slug);
                  router.push({
                    pathname: '/(app)/chat/[conversationId]',
                    params: {
                      conversationId: conversation.id.toString(),
                      isGroup: 'true',
                      groupName: conversation.groupName,
                      inviteSlug: slug,
                    },
                  });
                } catch {
                  Alert.alert('Error', 'Could not join this group.');
                }
              },
            },
          ],
        );
      } catch {
        if (cancelled) return;
        setStatusText('This group was not found.');
        setTimeout(() => {
          if (!cancelled) router.replace('/(app)/chat');
        }, 1200);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={COLORS.primary} size="large" />
      <Text style={[styles.text, { color: colors.text }]}>{statusText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  text: {
    fontFamily: FONTS.medium,
    fontSize: 15,
  },
});
