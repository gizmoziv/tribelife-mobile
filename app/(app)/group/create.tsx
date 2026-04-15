import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { groupsApi } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlowBadge } from '@/components/ui/GlowBadge';
import Svg, { Path, Circle } from 'react-native-svg';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

// ---------- Tiny icon set (stroke-based, matches app's SVG style) ----------
type IconProps = { color?: string; size?: number };

const IconClock = ({ color = COLORS.primary, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
    <Path d="M12 7v5l3 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconGlobe = ({ color = COLORS.primary, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
    <Path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const IconSparkles = ({ color = COLORS.primary, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    <Path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
  </Svg>
);

const IconBeacon = ({ color = COLORS.accent, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="10" r="3" stroke={color} strokeWidth={1.8} />
    <Path d="M6 17c-1.5-1.8-2.3-3.6-2.3-5.5C3.7 7.4 7.4 4 12 4s8.3 3.4 8.3 7.5c0 1.9-.8 3.7-2.3 5.5M12 14v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const IconCompass = ({ color = COLORS.primary, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.8} />
    <Path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
  </Svg>
);

const IconChart = ({ color = COLORS.primary, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const IconMoon = ({ color = COLORS.accent, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 14.5A8.5 8.5 0 019.5 4a7 7 0 1010.5 10.5z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
);

const IconScroll = ({ color = COLORS.accent, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 5h11a2 2 0 012 2v10a2 2 0 002 2H8a2 2 0 01-2-2V5zM5 5a2 2 0 00-2 2v2h3M9 9h7M9 13h7" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconSun = ({ color = COLORS.accent, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={1.8} />
    <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>
);

const IconFlame = ({ color = COLORS.accent, size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2s-6 6-6 12a6 6 0 0012 0c0-3-2-5-2-5s-1 1.5-2 1.5c0-3-2-5-2-8.5z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
      fill={color}
      fillOpacity={0.15}
    />
  </Svg>
);

const IconAleph = ({ color = COLORS.accent, size = 16 }: IconProps) => (
  // Hebrew aleph glyph outline — simple, recognizable
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 5l12 14M18 5L9 13c-2 1.8-2 4.5 1 4.5M6 19c3 0 3-2.7 1-4.5L15 9"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ---------- Bullet row ----------
interface BulletRowProps {
  icon: React.ReactNode;
  text: string;
  comingSoon?: boolean;
  textColor: string;
  mutedColor: string;
}

const BulletRow = ({ icon, text, comingSoon, textColor, mutedColor }: BulletRowProps) => (
  <View style={styles.bulletRow}>
    <View style={styles.bulletIcon}>{icon}</View>
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <Text style={[styles.bulletText, { color: textColor }]}>{text}</Text>
      {comingSoon && <GlowBadge text="Coming soon" size="sm" color={COLORS.primary} />}
    </View>
  </View>
);

// ---------- Gradient-backed tagline pill (no MaskedView dep) ----------
const GradientTagline = ({ text }: { text: string }) => (
  <LinearGradient
    colors={['rgba(245,158,11,0.18)', 'rgba(249,115,22,0.12)', 'rgba(129,140,248,0.18)']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.taglinePill}
  >
    <Text style={[styles.taglineText, { color: COLORS.accent }]}>{text}</Text>
  </LinearGradient>
);

export default function CreateGroupScreen() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleNameChange = (text: string) => {
    const trimmed = text.slice(0, 50);
    setName(trimmed);
    if (!slugEdited) {
      setSlug(slugify(trimmed));
    }
  };

  const handleSlugChange = (text: string) => {
    setSlugEdited(true);
    setSlug(text.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30));
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter a group name.');
      return;
    }
    setIsCreating(true);
    try {
      const { conversation } = await groupsApi.create(trimmedName, slug || undefined);
      router.replace({
        pathname: '/(app)/chat/[conversationId]',
        params: {
          conversationId: conversation.id.toString(),
          isGroup: 'true',
          groupName: conversation.groupName,
        },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/profile');
    }
  };

  const isPremium = !!user?.isPremium;

  // ---------- Shared marketing blocks (both premium + non-premium) ----------
  const LeaderCard = (
    <AnimatedEntry>
      <GlassCard glowColor={COLORS.borderGlow}>
        <View style={styles.leaderInner}>
          <Text style={[styles.leaderTitle, { color: colors.text }]}>For Community Leaders</Text>
          <Text style={[styles.leaderBody, { color: colors.textMuted }]}>
            Running a kabbalah study group, beach yoga meetup or commercial network in a given industry? TribeLife helps your members find each other for study partners, Shabbat meals, volunteering and more. The connections that used to happen organically in Jewish community settings now happen in our digital Tribe.
          </Text>
        </View>
      </GlassCard>
    </AnimatedEntry>
  );

  const DifferentSection = (
    <>
      <AnimatedEntry delay={120} style={{ marginTop: SPACING.lg }}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionEyebrow, { color: COLORS.primary }]}>The difference</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>How TribeLife is different</Text>
        </View>
      </AnimatedEntry>

      <AnimatedEntry delay={180} style={{ marginTop: SPACING.md }}>
        <GlassCard>
          <View style={styles.cardInner}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.cardIconWrap, { backgroundColor: COLORS.accentSoft }]}>
                <IconFlame color={COLORS.accent} size={18} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>TribeLife vs. other chat apps</Text>
            </View>
            <View style={styles.bulletList}>
              <BulletRow
                icon={<IconClock color={COLORS.accent} />}
                text="Historical conversations from day one — not just from when you joined"
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconGlobe color={COLORS.accent} />}
                text="Smart translation of every comment, in any language"
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconBeacon color={COLORS.accent} />}
                text="Beacon system for intelligent matching by location and shared interests"
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconCompass color={COLORS.accent} />}
                text="Discoverable & monetizable groups"
                comingSoon
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconChart color={COLORS.accent} />}
                text="Group owner dashboard with engagement insights"
                comingSoon
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
            </View>
          </View>
        </GlassCard>
      </AnimatedEntry>
    </>
  );

  const TribeSection = (
    <>
      <AnimatedEntry delay={240} style={{ marginTop: SPACING.lg }}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionEyebrow, { color: COLORS.accent }]}>Built for the Tribe</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Uniquely Jewish</Text>
        </View>
      </AnimatedEntry>

      <AnimatedEntry delay={300} style={{ marginTop: SPACING.md }}>
        <GlassCard glowColor={COLORS.borderGlow}>
          <View style={styles.cardInner}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.cardIconWrap, { backgroundColor: COLORS.accentSoft }]}>
                <IconAleph color={COLORS.accent} size={18} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>For Jewish life, by design</Text>
            </View>
            <View style={styles.bulletList}>
              <BulletRow
                icon={<IconMoon color={COLORS.accent} />}
                text="Shabbat mode notifications — auto-pause and resume"
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconGlobe color={COLORS.accent} />}
                text="Timezone-aware community rooms across the diaspora"
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconAleph color={COLORS.accent} />}
                text="Hebrew and RTL language support throughout"
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
              <BulletRow
                icon={<IconScroll color={COLORS.primary} />}
                text="Curated Jewish news feed"
                comingSoon
                textColor={colors.text}
                mutedColor={colors.textMuted}
              />
            </View>
          </View>
        </GlassCard>
      </AnimatedEntry>
    </>
  );

  const Tagline = (
    <AnimatedEntry delay={360} style={{ marginTop: SPACING.lg, alignItems: 'center' }}>
      <View style={styles.taglineWrap}>
        <View style={[styles.taglineDot, { backgroundColor: COLORS.accent }]} />
        <GradientTagline text="Our community, supercharged." />
        <View style={[styles.taglineDot, { backgroundColor: COLORS.primary }]} />
      </View>
    </AnimatedEntry>
  );

  // ---------- Non-premium view ----------
  if (!isPremium) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Create Group</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {LeaderCard}
          {DifferentSection}
          {TribeSection}
          {Tagline}

          <AnimatedEntry delay={420} style={{ marginTop: SPACING.lg }}>
            <GlassCard glowColor={COLORS.borderGlow}>
              <View style={styles.formInner}>
                <Text style={[styles.label, { color: colors.text, textAlign: 'center', fontSize: 16 }]}>
                  Upgrade to Premium to create private groups
                </Text>
                <PillButton
                  title="Upgrade"
                  onPress={() => router.push('/(app)/profile')}
                  variant="primary"
                  size="lg"
                  style={{ width: '100%', marginTop: SPACING.lg }}
                />
              </View>
            </GlassCard>
          </AnimatedEntry>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Premium view ----------
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backButton}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke={COLORS.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Create Group</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {LeaderCard}
          {DifferentSection}
          {TribeSection}
          {Tagline}

          <AnimatedEntry delay={420} style={{ marginTop: SPACING.lg }}>
            <GlassCard>
              <View style={styles.formInner}>
                <Text style={[styles.label, { color: colors.text }]}>Group Name</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="My awesome group"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={handleNameChange}
                    maxLength={50}
                  />
                </View>
                <Text style={[styles.charCount, { color: colors.textMuted }]}>
                  {name.length}/50
                </Text>

                <Text style={[styles.label, { color: colors.text, marginTop: SPACING.md }]}>Invite Link</Text>
                <View style={[styles.slugRow]}>
                  <Text style={[styles.slugPrefix, { color: colors.textMuted }]}>tribelife.app/g/</Text>
                  <View style={[styles.slugInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="my-group"
                      placeholderTextColor={colors.textMuted}
                      value={slug}
                      onChangeText={handleSlugChange}
                      maxLength={30}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <PillButton
                  title="Create Group"
                  onPress={handleCreate}
                  variant="primary"
                  size="lg"
                  loading={isCreating}
                  disabled={isCreating || !name.trim()}
                  style={{ width: '100%', marginTop: SPACING.lg }}
                />
              </View>
            </GlassCard>
          </AnimatedEntry>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  scrollContent: {
    padding: SPACING.page,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING['2xl'],
  },
  formInner: {
    gap: 4,
  },
  leaderInner: {
    gap: 8,
  },
  leaderTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
  },
  leaderBody: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },

  // Section heading
  sectionHeader: {
    paddingHorizontal: 4,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
  },

  // Feature cards
  cardInner: {
    gap: SPACING.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    letterSpacing: -0.2,
    flex: 1,
  },
  bulletList: {
    gap: 10,
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletText: {
    fontSize: 13.5,
    fontFamily: FONTS.medium,
    lineHeight: 20,
    flexShrink: 1,
  },

  // Tagline
  taglineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  taglinePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
  },
  taglineText: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.3,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  taglineLink: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    letterSpacing: 1.2,
    textTransform: 'lowercase',
    textDecorationLine: 'underline',
  },

  // Form
  label: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
    marginBottom: 6,
  },
  inputWrap: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  charCount: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'right',
    marginTop: 4,
  },
  slugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slugPrefix: {
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  slugInputWrap: {
    flex: 1,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
