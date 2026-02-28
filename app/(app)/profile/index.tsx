import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Purchases from 'react-native-purchases';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth } from '@/services/api';
import { clearToken } from '@/services/api';
import { disconnectSocket } from '@/services/socket';
import { FONTS, COLORS, PREMIUM_PRICE, PREMIUM_BEACON_LIMIT } from '@/constants';

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, updateUser } = useAuthStore();
  const router = useRouter();

  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          disconnectSocket();
          await logout();
          router.replace('/(auth)/welcome');
        },
      },
    ]);
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      // RevenueCat purchase flow
      const offerings = await Purchases.getOfferings();
      const monthly = offerings.current?.monthly;

      if (!monthly) {
        Alert.alert('Unavailable', 'Premium is not available right now. Please try again later.');
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(monthly);

      const isPremium =
        customerInfo.entitlements.active['premium'] !== undefined;

      if (isPremium) {
        updateUser({ isPremium: true });
        Alert.alert(
          '🎉 Welcome to Premium!',
          `You can now run up to ${PREMIUM_BEACON_LIMIT} beacons at a time. Thank you for supporting TribeLife!`,
          [{ text: 'Awesome!' }]
        );
      }
    } catch (err: any) {
      if (!err.userCancelled) {
        Alert.alert('Purchase Failed', err.message ?? 'Please try again.');
      }
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleRestorePurchase = async () => {
    try {
      const customerInfo = await Purchases.restorePurchases();
      const isPremium = customerInfo.entitlements.active['premium'] !== undefined;
      if (isPremium) {
        updateUser({ isPremium: true });
        Alert.alert('Restored!', 'Your premium subscription has been restored.');
      } else {
        Alert.alert('No Subscription Found', 'No active premium subscription was found for your account.');
      }
    } catch {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Header */}
        <View style={[styles.userCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.avatarText}>
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View>
            <Text style={[styles.userName, { color: colors.text }]}>{user?.name}</Text>
            <Text style={[styles.userHandle, { color: colors.textMuted }]}>@{user?.handle}</Text>
            {user?.isPremium && (
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>✨ Premium</Text>
              </View>
            )}
          </View>
        </View>

        {/* Appearance */}
        <SettingsSection title="Appearance">
          <SettingsRow
            label="Dark Mode"
            right={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: COLORS.primary }}
                thumbColor="#FFF"
              />
            }
          />
        </SettingsSection>

        {/* Premium */}
        {!user?.isPremium && (
          <SettingsSection title="Premium">
            <View style={[styles.premiumCard, { borderColor: COLORS.accent }]}>
              <Text style={[styles.premiumTitle, { color: colors.text }]}>
                Upgrade to Premium
              </Text>
              <Text style={[styles.premiumDesc, { color: colors.textMuted }]}>
                • Run up to {PREMIUM_BEACON_LIMIT} beacons simultaneously{'\n'}
                • Priority matching in your area{'\n'}
                • Support the TribeLife community
              </Text>
              <TouchableOpacity
                style={[styles.upgradeButton, { opacity: isUpgrading ? 0.7 : 1 }]}
                onPress={handleUpgrade}
                disabled={isUpgrading}
              >
                {isUpgrading ? (
                  <ActivityIndicator color="#0F172A" />
                ) : (
                  <Text style={styles.upgradeButtonText}>
                    Upgrade · {PREMIUM_PRICE}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRestorePurchase}>
                <Text style={[styles.restoreText, { color: colors.textMuted }]}>
                  Restore purchase
                </Text>
              </TouchableOpacity>
            </View>
          </SettingsSection>
        )}

        {/* Account */}
        <SettingsSection title="Account">
          <SettingsRow
            label="Email"
            right={
              <Text style={[styles.settingValue, { color: colors.textMuted }]}>
                {user?.email}
              </Text>
            }
          />
          <SettingsRow
            label="Timezone"
            right={
              <Text style={[styles.settingValue, { color: colors.textMuted }]}>
                {user?.timezone ?? 'Not set'}
              </Text>
            }
          />
        </SettingsSection>

        {/* Danger Zone */}
        <SettingsSection title="Session">
          <TouchableOpacity
            style={[styles.logoutButton, { borderColor: COLORS.error }]}
            onPress={handleLogout}
          >
            <Text style={[styles.logoutText, { color: COLORS.error }]}>Log Out</Text>
          </TouchableOpacity>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function SettingsRow({ label, right }: { label: string; right: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 8 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 24, fontFamily: FONTS.bold },
  userName: { fontSize: 18, fontFamily: FONTS.semiBold },
  userHandle: { fontSize: 14, fontFamily: FONTS.regular, marginTop: 2 },
  premiumBadge: {
    marginTop: 4,
    backgroundColor: COLORS.accent + '33',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  premiumBadgeText: { color: COLORS.accent, fontSize: 12, fontFamily: FONTS.semiBold },
  section: { gap: 6, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.semiBold, letterSpacing: 1, paddingLeft: 4 },
  sectionContent: { borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontFamily: FONTS.medium },
  settingValue: { fontSize: 14, fontFamily: FONTS.regular, maxWidth: 200, textAlign: 'right' },
  premiumCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  premiumTitle: { fontSize: 17, fontFamily: FONTS.bold },
  premiumDesc: { fontSize: 14, fontFamily: FONTS.regular, lineHeight: 22 },
  upgradeButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  upgradeButtonText: { color: '#0F172A', fontSize: 15, fontFamily: FONTS.bold },
  restoreText: { fontSize: 13, fontFamily: FONTS.regular, textAlign: 'center' },
  logoutButton: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
  },
  logoutText: { fontSize: 15, fontFamily: FONTS.semiBold },
});
