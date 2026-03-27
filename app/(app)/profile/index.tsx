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
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import Purchases from 'react-native-purchases';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth } from '@/services/api';
import { clearToken } from '@/services/api';
import { disconnectSocket } from '@/services/socket';
import { requestAvatarUploadUrl, uploadToSpaces, confirmAvatarUpload } from '@/services/upload';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS, PREMIUM_PRICE, PREMIUM_BEACON_LIMIT } from '@/constants';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import Svg, { Path, Circle } from 'react-native-svg';

function ChevronIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={4} stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, logout, updateUser } = useAuthStore();
  const router = useRouter();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleAvatarUpload() {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photo library to upload an avatar.');
        return;
      }

      const pickResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (pickResult.canceled) return;

      setUploadingAvatar(true);

      // Process image: resize to 500x500 JPEG at 0.8 quality
      const processed = await manipulateAsync(
        pickResult.assets[0].uri,
        [{ resize: { width: 500, height: 500 } }],
        { compress: 0.8, format: SaveFormat.JPEG }
      );

      // Optimistic local update
      updateUser({ avatarUrl: processed.uri });

      // Three-step upload flow
      console.log('[profile] Step 1: requesting upload URL...');
      const { uploadUrl, key } = await requestAvatarUploadUrl();
      console.log('[profile] Step 1 complete, key:', key);

      console.log('[profile] Step 2: uploading to Spaces...');
      await uploadToSpaces(uploadUrl, processed.uri);
      console.log('[profile] Step 2 complete');

      console.log('[profile] Step 3: confirming upload...');
      const { avatarUrl } = await confirmAvatarUpload(key);
      console.log('[profile] Step 3 complete, url:', avatarUrl);

      // Update with final CDN URL
      updateUser({ avatarUrl });
    } catch (err: any) {
      console.error('[profile] Avatar upload failed:', err?.message || err);
      Alert.alert('Upload failed', err?.message || 'Could not upload your photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'All your conversations, beacons, and profile data will be permanently removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await auth.deleteAccount();
                      disconnectSocket();
                      await logout();
                      router.replace('/(auth)/welcome');
                    } catch {
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const offerings = await Purchases.getOfferings();
      const monthly = offerings.current?.monthly;

      if (!monthly) {
        Alert.alert('Unavailable', 'Premium is not available right now. Please try again later.');
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(monthly);
      const isPremium = customerInfo.entitlements.active['premium'] !== undefined;

      if (isPremium) {
        updateUser({ isPremium: true });
        Alert.alert(
          'Welcome to Premium!',
          `You can now run up to ${PREMIUM_BEACON_LIMIT} beacons at a time. Thank you for supporting TribeLife!`,
          [{ text: 'Awesome!' }]
        );
      }
    } catch (err: any) {
      if (!err.userCancelled) {
        Alert.alert('Purchase Failed', 'Unable to complete the purchase. Please try again later.');
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
        <AnimatedEntry>
          <GlassCard>
            <View style={styles.userCardInner}>
              <TouchableOpacity onPress={handleAvatarUpload} disabled={uploadingAvatar}>
                <View>
                  <AvatarCircle name={user?.name ?? '?'} size={64} imageUrl={user?.avatarUrl ?? undefined} />
                  <View style={{
                    position: 'absolute', bottom: 0, right: 0,
                    backgroundColor: COLORS.primary, borderRadius: 12,
                    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2, borderColor: colors.background,
                  }}>
                    {uploadingAvatar ? (
                      <ActivityIndicator size={12} color="#fff" />
                    ) : (
                      <CameraIcon />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: colors.text }]}>{user?.name}</Text>
                <Text style={[styles.userHandle, { color: COLORS.primary }]}>@{user?.handle}</Text>
                {user?.isPremium && (
                  <GlowBadge text="Premium" color={COLORS.accent} glow />
                )}
              </View>
            </View>
          </GlassCard>
        </AnimatedEntry>

        {/* Appearance */}
        <AnimatedEntry delay={60}>
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
        </AnimatedEntry>

        {/* Premium */}
        {!user?.isPremium && (
          <AnimatedEntry delay={120}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PREMIUM</Text>
              <GlassCard glowColor={COLORS.borderGlow}>
                <View style={styles.premiumInner}>
                  <Text style={[styles.premiumTitle, { color: colors.text }]}>
                    Upgrade to Premium
                  </Text>
                  <Text style={[styles.premiumDesc, { color: colors.textMuted }]}>
                    {`\u2022 Run up to ${PREMIUM_BEACON_LIMIT} beacons simultaneously\n\u2022 Priority matching in your area\n\u2022 Support the TribeLife community`}
                  </Text>
                  <Text style={[styles.subscriptionInfo, { color: colors.textMuted }]}>
                    TribeLife Premium is a monthly auto-renewable subscription at {PREMIUM_PRICE}. Payment is charged to your Apple ID account at confirmation. The subscription automatically renews unless canceled at least 24 hours before the end of the current period.
                  </Text>
                  <PillButton
                    title={`Upgrade \u00B7 ${PREMIUM_PRICE}`}
                    onPress={handleUpgrade}
                    variant="accent"
                    size="lg"
                    loading={isUpgrading}
                    disabled={isUpgrading}
                    style={{ width: '100%' }}
                  />
                  <TouchableOpacity onPress={handleRestorePurchase}>
                    <Text style={[styles.restoreText, { color: colors.textMuted }]}>
                      Restore purchase
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.legalLinks}>
                    <TouchableOpacity onPress={() => Linking.openURL('https://tribelife.app/terms')}>
                      <Text style={[styles.legalLink, { color: COLORS.primary }]}>Terms of Use</Text>
                    </TouchableOpacity>
                    <Text style={{ color: colors.textMuted }}> {'\u00B7'} </Text>
                    <TouchableOpacity onPress={() => Linking.openURL('https://tribelife.app/privacy')}>
                      <Text style={[styles.legalLink, { color: COLORS.primary }]}>Privacy Policy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            </View>
          </AnimatedEntry>
        )}

        {/* Account */}
        <AnimatedEntry delay={180}>
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
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: 'transparent' }]}
              onPress={() => router.push('/(app)/profile/blocked-users')}
            >
              <Text style={[styles.rowLabel, { color: colors.text }]}>Blocked Users</Text>
              <ChevronIcon color={colors.textMuted} />
            </TouchableOpacity>
          </SettingsSection>
        </AnimatedEntry>

        {/* Help */}
        <AnimatedEntry delay={240}>
          <SettingsSection title="Help">
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: 'transparent' }]}
              onPress={() => router.push('/support')}
            >
              <Text style={[styles.rowLabel, { color: colors.text }]}>Contact Support</Text>
              <ChevronIcon color={colors.textMuted} />
            </TouchableOpacity>
          </SettingsSection>
        </AnimatedEntry>

        {/* Session */}
        <AnimatedEntry delay={300}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SESSION</Text>
            <PillButton
              title="Log Out"
              onPress={handleLogout}
              variant="outline"
              size="md"
              style={{ width: '100%' }}
              textStyle={{ color: COLORS.error }}
            />
          </View>
        </AnimatedEntry>

        <AnimatedEntry delay={360}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DANGER ZONE</Text>
            <PillButton
              title="Delete Account"
              onPress={handleDeleteAccount}
              variant="ghost"
              size="md"
              style={{ width: '100%', backgroundColor: COLORS.error }}
              textStyle={{ color: '#FFF' }}
            />
          </View>
        </AnimatedEntry>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      <GlassCard borderRadius={RADIUS.lg}>
        {children}
      </GlassCard>
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
  scroll: { padding: SPACING.page, gap: SPACING.sm },
  userCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  userName: { fontSize: 20, fontFamily: FONTS.semiBold },
  userHandle: { fontSize: 14, fontFamily: FONTS.medium, marginTop: 2 },
  section: { gap: 6, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.semiBold, letterSpacing: 1, paddingLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontFamily: FONTS.medium },
  settingValue: { fontSize: 14, fontFamily: FONTS.regular, maxWidth: 200, textAlign: 'right' },
  premiumInner: { gap: 10 },
  premiumTitle: { fontSize: 18, fontFamily: FONTS.bold },
  premiumDesc: { fontSize: 14, fontFamily: FONTS.regular, lineHeight: 22 },
  subscriptionInfo: { fontSize: 11, fontFamily: FONTS.regular, lineHeight: 16 },
  restoreText: { fontSize: 13, fontFamily: FONTS.regular, textAlign: 'center' },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  legalLink: { fontSize: 12, fontFamily: FONTS.medium },
});
