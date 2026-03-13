import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { moderationApi } from '@/services/api';
import { FONTS, COLORS } from '@/constants';

type BlockedEntry = {
  id: number;
  blockedUserId: number;
};

export default function BlockedUsersScreen() {
  const { colors } = useTheme();
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    moderationApi.getBlocked()
      .then(({ blockedUsers }) => {
        setBlocked(blockedUsers);
      })
      .catch(() => {
        Alert.alert('Error', 'Could not load blocked users. Please try again.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleUnblock = useCallback((entry: BlockedEntry) => {
    Alert.alert(
      'Unblock User',
      `Unblock User #${entry.blockedUserId}? They will be able to send you messages again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            try {
              await moderationApi.unblockUser(entry.blockedUserId);
              setBlocked((prev) => prev.filter((b) => b.id !== entry.id));
            } catch {
              Alert.alert('Error', 'Failed to unblock user. Please try again.');
            }
          },
        },
      ]
    );
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (blocked.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🚫</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No blocked users</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            You haven't blocked anyone.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={blocked}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.avatarText}>#</Text>
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.userId, { color: colors.text }]}>
                User #{item.blockedUserId}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.unblockButton, { borderColor: COLORS.primary }]}
              onPress={() => handleUnblock(item)}
            >
              <Text style={[styles.unblockText, { color: COLORS.primary }]}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptySubtitle: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 18, fontFamily: FONTS.bold },
  rowInfo: { flex: 1 },
  userId: { fontSize: 15, fontFamily: FONTS.semiBold },
  unblockButton: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unblockText: { fontSize: 13, fontFamily: FONTS.semiBold },
});
