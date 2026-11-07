// "Signed in as <email> · Not you? Log out" footer for the pre-app auth screens
// (onboarding, apply-for-access). Those screens sit before the tab navigator, so
// the Profile → Log Out button is unreachable from them; without this a user who
// signed in with the wrong account is stuck (and on iOS the Keychain token even
// survives reinstalling the app).
import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { disconnectSocket } from '@/services/socket';
import { FONTS, COLORS, SPACING } from '@/constants';

export function NotYouLogout() {
  const router = useRouter();
  const email = useAuthStore((s) => s.user?.email);
  const logout = useAuthStore((s) => s.logout);

  const handlePress = () => {
    Alert.alert(
      'Log Out',
      'Log out and sign in with a different account?',
      [
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
      ],
    );
  };

  return (
    <View style={styles.container}>
      {email ? (
        <Text style={styles.signedInAs} numberOfLines={1}>
          Signed in as {email}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Not you? Log out"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.link}>Not you? Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

export default NotYouLogout;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xl,
  },
  signedInAs: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  link: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
});
