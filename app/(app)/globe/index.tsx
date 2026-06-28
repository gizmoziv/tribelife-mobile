import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import Purchases from 'react-native-purchases';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import {
  connectSocket,
  onGlobeParticipants,
  onChevraGroupMessage,
  onChatNotification,
} from '@/services/socket';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { useChevraSection } from '@/hooks/useChevraSection';
import { ChevraSection } from '@/components/ui/chevra/ChevraSection';
import { UpgradeModal } from '@/components/ui/UpgradeModal';
import type { ChevraRow } from '@/types';

const TIMEZONE_UPGRADE_BODY =
  'Premium members can join timezone rooms beyond their own — connect with Jews in different parts of the world.';

// Stable key across the three sections (matches the legacy keyExtractor so a row
// that ever moves between sections can't collide).
function keyForItem(item: ChevraRow): string {
  if (item.kind === 'group') return `group_${item.conversationId}`;
  if (item.kind === 'timezone_room') return `timezone_room_${item.slug}`;
  return `globe_${item.slug}`;
}

export default function GlobeScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // One paging hook per discovery carousel. Each refetches page 0 when
  // debouncedQuery changes (server-side ?q= filter).
  const regions = useChevraSection('regions', debouncedQuery);
  const chavurot = useChevraSection('chavurot', debouncedQuery);
  const timezones = useChevraSection('timezones', debouncedQuery);

  const tabBarSpace = useTabBarSpace();

  const regionsReset = regions.reset;
  const chavurotReset = chavurot.reset;
  const timezonesReset = timezones.reset;
  const regionsSetRows = regions.setRows;
  const chavurotSetRows = chavurot.setRows;

  // Refresh on tab re-focus (skip the first focus — the hooks already fetched on
  // mount, so resetting here too would double-fetch).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      regionsReset();
      chavurotReset();
      timezonesReset();
    }, [regionsReset, chavurotReset, timezonesReset]),
  );

  // Live socket updates patched directly onto the relevant section's rows.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    connectSocket().then(() => {
      cleanups.push(
        onGlobeParticipants(({ slug, count }) => {
          regionsSetRows((prev) =>
            prev.map((r) =>
              r.kind === 'globe_room' && r.slug === slug
                ? { ...r, participantCount: count }
                : r,
            ),
          );
        }),
      );
      cleanups.push(
        onChevraGroupMessage((payload) => {
          chavurotSetRows((prev) =>
            prev.map((r) =>
              r.kind === 'group' && r.conversationId === payload.conversationId
                ? { ...r, lastMessage: payload.lastMessage }
                : r,
            ),
          );
        }),
      );
    });
    return () => cleanups.forEach((fn) => fn());
  }, [regionsSetRows, chavurotSetRows]);

  // A community join/leave shifts the Chavurot discovery set — refetch page 0.
  useEffect(() => {
    return onChatNotification((raw) => {
      const body = (raw as { body?: string } | null)?.body;
      if (
        typeof body === 'string' &&
        /(joined|left) the community$/.test(body)
      ) {
        chavurotReset();
      }
    });
  }, [chavurotReset]);

  // RevenueCat purchase flow — on success, refresh caps and refetch the
  // timezones carousel so the paywalled row the user tapped becomes joinable.
  const handleUpgrade = useCallback(async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const monthly = offerings.current?.monthly;
      if (!monthly) {
        Alert.alert(
          'Unavailable',
          'Premium is not available right now. Please try again later.',
        );
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(monthly);
      const isPremiumEntitlement =
        customerInfo.entitlements.active['premium'] !== undefined;
      if (isPremiumEntitlement) {
        await useAuthStore.getState().refreshCapabilities();
        timezonesReset();
      }
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert(
          'Purchase Failed',
          'Unable to complete the purchase. Please try again later.',
        );
      }
    }
  }, [timezonesReset]);

  const handlePressItem = useCallback(
    (item: ChevraRow) => {
      if (item.kind === 'group') {
        router.push({
          pathname: '/(app)/globe/group/[conversationId]',
          params: {
            conversationId: item.conversationId.toString(),
            isGroup: 'true',
            groupName: item.name,
            isMember: item.isMember ? 'true' : 'false',
            inviteSlug: item.inviteSlug,
          },
        });
        return;
      }
      if (item.kind === 'timezone_room') {
        // Paywalled → UpgradeModal. Eligible → preview screen; its "Join Chat"
        // button performs the actual join (backend remains the authoritative gate).
        if (item.paywalled) {
          setUpgradeModalVisible(true);
          return;
        }
        router.push(`/(app)/globe/${item.slug}`);
        return;
      }
      // globe_room (region)
      router.push(`/globe/${item.slug}`);
    },
    [router],
  );

  const isSearching = debouncedQuery.trim().length > 0;
  const initialLoading =
    regions.isLoading && chavurot.isLoading && timezones.isLoading;
  const allEmpty =
    !regions.isLoading &&
    !chavurot.isLoading &&
    !timezones.isLoading &&
    regions.rows.length === 0 &&
    chavurot.rows.length === 0 &&
    timezones.rows.length === 0;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: 'Community', headerBackTitle: 'Back' }} />
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            style={[
              styles.searchInput,
              styles.searchInputWithClear,
              {
                backgroundColor: colors.surfaceGlass,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="Search communities"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.searchClearButton}
              hitSlop={10}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Text
                style={[styles.searchClearText, { color: colors.textMuted }]}
              >
                ×
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {initialLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : allEmpty ? (
        <View style={styles.emptyMatches}>
          <Text style={[styles.emptyMatchesText, { color: colors.textMuted }]}>
            {isSearching
              ? 'No matches for "' + debouncedQuery + '"'
              : 'No communities to discover right now.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: tabBarSpace },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ChevraSection
            title="Community Groups"
            state={chavurot}
            onPressItem={handlePressItem}
            keyForItem={keyForItem}
          />
          <ChevraSection
            title="Timezone Chats"
            state={timezones}
            onPressItem={handlePressItem}
            keyForItem={keyForItem}
          />
          <ChevraSection
            title="Regions"
            state={regions}
            onPressItem={handlePressItem}
            keyForItem={keyForItem}
          />
        </ScrollView>
      )}

      <UpgradeModal
        visible={upgradeModalVisible}
        onClose={() => setUpgradeModalVisible(false)}
        onUpgrade={handleUpgrade}
        body={TIMEZONE_UPGRADE_BODY}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    paddingTop: SPACING.sm,
  },
  searchRow: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  searchInput: {
    height: 40,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  searchInputWrapper: {
    position: 'relative',
  },
  searchInputWithClear: {
    paddingRight: 36,
  },
  searchClearButton: {
    position: 'absolute',
    right: 6,
    top: 0,
    height: 40,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 22,
    fontFamily: FONTS.regular,
    lineHeight: 24,
  },
  emptyMatches: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  emptyMatchesText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
});
