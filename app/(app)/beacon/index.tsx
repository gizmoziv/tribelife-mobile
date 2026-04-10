import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { beacons as beaconsApi, chat } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { PillToggle } from '@/components/ui/PillToggle';
import { GlowBadge } from '@/components/ui/GlowBadge';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import type { Beacon, BeaconMatch } from '@/types';
import Svg, { Path } from 'react-native-svg';

function FlameIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 22c4.97 0 8-3.03 8-7 0-2-1-3.5-2-5-1.5 1-2 2-2 2s-1-2-2-4c-1.5 2-3 4-3 7 0 1-1 2-2 2s-2-1-2-2c0-2.5 2-5 3-6-2 0-4 2-5 4-1 2-1 3-1 4 0 3.97 3.03 7 8 7z" stroke="#F59E0B" strokeWidth={1.5} fill="rgba(245,158,11,0.15)" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type Tab = 'beacons' | 'matches';

export default function BeaconScreen() {
  const { colors } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>(tab === 'matches' ? 'matches' : 'beacons');
  const tabIndex = activeTab === 'beacons' ? 0 : 1;

  // Lift match state here so it survives tab switches (MatchesPanel unmounting)
  const [matches, setMatches] = useState<BeaconMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  useEffect(() => {
    beaconsApi.getMatches().then(({ matches: m }) => {
      setMatches(m);
      setMatchesLoading(false);
    }).catch(() => setMatchesLoading(false));
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <View style={styles.toggleContainer}>
          <PillToggle
            options={['My Beacons', 'Matches']}
            activeIndex={tabIndex}
            onSelect={(i) => setActiveTab(i === 0 ? 'beacons' : 'matches')}
            activeColor={COLORS.accent}
          />
        </View>

        {activeTab === 'beacons' ? (
          <MyBeaconsPanel />
        ) : (
          <MatchesPanel
            matches={matches}
            setMatches={setMatches}
            isLoading={matchesLoading}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── My Beacons Panel ──────────────────────────────────────────────────────
function MyBeaconsPanel() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const { user } = useAuthStore();
  const router = useRouter();
  const [myBeacons, setMyBeacons] = useState<Beacon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  const isPremium = user?.isPremium ?? false;
  const activeBeacons = myBeacons.filter((b) => b.isActive);
  const limit = isPremium ? 3 : 1;
  const canAddMore = activeBeacons.length < limit;

  const { BEACON_EXAMPLES } = require('@/constants');

  useEffect(() => {
    loadBeacons();
  }, []);

  const loadBeacons = async () => {
    try {
      const { beacons } = await beaconsApi.mine();
      setMyBeacons(beacons);
    } catch { }
    setIsLoading(false);
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || text.length < 10) {
      Alert.alert('Too Short', 'Please describe your beacon in at least 10 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { beacon } = await beaconsApi.create(text);
      setMyBeacons((prev) => [beacon, ...prev]);
      setInputText('');
      Alert.alert(
        'Beacon Lit!',
        "Your beacon has been posted. We'll notify you when we find a match.",
        [{ text: 'Great!' }]
      );
    } catch (err: any) {
      if (err.data?.upgradeRequired) {
        Alert.alert(
          'Upgrade to Premium',
          `Free accounts can run 1 beacon at a time. Premium unlocks 3 beacons for $4.99/month.`,
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/(app)/profile') },
          ]
        );
      } else {
        Alert.alert(
          'Beacon Not Posted',
          err.message ?? 'Something went wrong. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (beaconId: number) => {
    Alert.alert('Remove Beacon', 'Are you sure you want to remove this beacon?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await beaconsApi.deactivate(beaconId);
          setMyBeacons((prev) =>
            prev.map((b) => (b.id === beaconId ? { ...b, isActive: false } : b))
          );
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      {/* Explainer */}
      <AnimatedEntry>
        <GlassCard glowColor={COLORS.borderGlow}>
          <View style={styles.explainerInner}>
            <View style={styles.explainerIconWrap}>
              <FlameIcon size={28} />
            </View>
            <Text style={[styles.explainerTitle, { color: colors.text }]}>What is a Beacon?</Text>
            <Text style={[styles.explainerBody, { color: colors.textMuted }]}>
              A beacon is a short description of something you're looking for or offering. Every 24 hours, we match your beacon with others in your timezone using AI.
            </Text>
            <GlowBadge
              text={`${activeBeacons.length}/${limit} beacons active${!isPremium ? ' (Free plan)' : ''}`}
              color={COLORS.accent}
              glow
            />
          </View>
        </GlassCard>
      </AnimatedEntry>

      {/* Input */}
      {canAddMore ? (
        <AnimatedEntry delay={100} style={styles.inputSection}>
          <View style={[styles.beaconInput, { backgroundColor: colors.surfaceGlass, borderColor: inputText.length >= 10 ? COLORS.accent : colors.border }]}>
            <TextInput
              style={[styles.beaconInputText, { color: colors.text, fontFamily: FONTS.regular }]}
              placeholder="e.g. I want to find people to play chess in the evenings"
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={280}
            />
          </View>
          <View style={styles.inputMeta}>
            <TouchableOpacity onPress={() => setShowExamples(!showExamples)}>
              <Text style={[styles.exampleToggle, { color: COLORS.accent }]}>
                {showExamples ? 'Hide examples' : 'See examples'}
              </Text>
            </TouchableOpacity>
            <GlowBadge text={`${inputText.length}/280`} color={colors.textMuted} size="sm" />
          </View>

          {showExamples && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.examplesScroll}
            >
              {BEACON_EXAMPLES.map((ex: string) => (
                <TouchableOpacity
                  key={ex}
                  style={[styles.exampleChip, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}
                  onPress={() => setInputText(ex)}
                >
                  <Text style={[styles.exampleChipText, { color: colors.text }]}>{ex}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <PillButton
            title="Light Beacon"
            onPress={handleSubmit}
            variant="accent"
            size="lg"
            loading={isSubmitting}
            disabled={inputText.trim().length < 10 || isSubmitting}
            icon={<FlameIcon />}
            style={{ width: '100%' }}
          />
        </AnimatedEntry>
      ) : (
        <AnimatedEntry delay={100}>
          <GlassCard>
            <Text style={[styles.limitReachedText, { color: colors.textMuted }]}>
              {isPremium
                ? 'You have 3 active beacons (maximum for premium).'
                : 'You have 1 active beacon. Upgrade to Premium to run up to 3.'}
            </Text>
          </GlassCard>
        </AnimatedEntry>
      )}

      {/* Existing beacons */}
      {myBeacons.length > 0 && (
        <View style={styles.beaconList}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Your Beacons</Text>
          {myBeacons.map((beacon, i) => (
            <AnimatedEntry key={beacon.id} delay={200 + i * 60}>
              <BeaconCard
                beacon={beacon}
                onDeactivate={() => handleDeactivate(beacon.id)}
              />
            </AnimatedEntry>
          ))}
        </View>
      )}

      {/* Bottom spacer for floating tab bar */}
      <View style={{ height: tabBarSpace }} />
    </ScrollView>
  );
}

function BeaconCard({ beacon, onDeactivate }: { beacon: Beacon; onDeactivate: () => void }) {
  const { colors } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const daysLeft = beacon.expiresAt
    ? Math.ceil((new Date(beacon.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  useEffect(() => {
    if (beacon.isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.8, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }
  }, [beacon.isActive]);

  return (
    <GlassCard
      glowColor={beacon.isActive ? COLORS.borderGlow : undefined}
      style={{ opacity: beacon.isActive ? 1 : 0.5 }}
    >
      <View style={styles.beaconCardHeader}>
        {beacon.isActive && (
          <Animated.View style={[styles.statusDot, { backgroundColor: COLORS.accent, opacity: pulseAnim }]} />
        )}
        {!beacon.isActive && (
          <View style={[styles.statusDot, { backgroundColor: colors.textMuted }]} />
        )}
        <Text style={[styles.beaconStatus, { color: beacon.isActive ? COLORS.accent : colors.textMuted }]}>
          {beacon.isActive ? 'Active' : 'Inactive'}
        </Text>
        {beacon.isActive && daysLeft !== null && (
          <GlowBadge text={`${daysLeft}d left`} color={colors.textMuted} size="sm" />
        )}
        {beacon.isActive && (
          <TouchableOpacity onPress={onDeactivate}>
            <GlowBadge text="Remove" color={COLORS.error} size="sm" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.beaconText, { color: colors.text }]}>{beacon.rawText}</Text>
      {beacon.parsedIntent && beacon.parsedIntent !== beacon.rawText && (
        <Text style={[styles.parsedIntent, { color: colors.textMuted }]}>
          AI understood: {beacon.parsedIntent}
        </Text>
      )}
      {beacon.lastMatchedAt && (
        <Text style={[styles.lastMatched, { color: colors.textMuted }]}>
          Last matched: {new Date(beacon.lastMatchedAt).toLocaleDateString()}
        </Text>
      )}
    </GlassCard>
  );
}

// ── Matches Panel ─────────────────────────────────────────────────────────
function MatchesPanel({
  matches,
  setMatches,
  isLoading,
}: {
  matches: BeaconMatch[];
  setMatches: React.Dispatch<React.SetStateAction<BeaconMatch[]>>;
  isLoading: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  const handleDismiss = async (matchId: number) => {
    // Optimistically remove from local state
    setMatches((prev) => prev.filter((m) => m.matchId !== matchId));
    try {
      await beaconsApi.dismissMatch(matchId);
    } catch {
      // Silently ignore — match is already removed from UI
    }
  };

  if (isLoading) return <View style={styles.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  if (matches.length === 0) {
    return (
      <View style={styles.emptyMatches}>
        <AnimatedEntry>
          <GlassCard>
            <View style={styles.emptyInner}>
              <FlameIcon size={36} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches yet</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                We run matching daily at 6 AM UTC. Light a beacon and check back tomorrow!
              </Text>
            </View>
          </GlassCard>
        </AnimatedEntry>
      </View>
    );
  }

  return (
    <FlatList
      data={matches}
      keyExtractor={(item) => item.matchId.toString()}
      contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: SPACING.page }}
      renderItem={({ item, index }) => (
        <AnimatedEntry delay={index * 60}>
          <MatchCard
            match={item}
            onMessage={async () => {
              if (!item.matchedUser) return;
              try {
                const { conversationId } = await chat.getOrCreateConversation(item.matchedUser.userId);
                router.push({
                  pathname: '/(app)/chat/[conversationId]',
                  params: { conversationId: conversationId.toString(), handle: item.matchedUser.userHandle },
                });
              } catch {
                Alert.alert('Error', 'Could not start conversation. Please try again.');
              }
            }}
            onViewProfile={() => {
              if (item.matchedUser?.userHandle) {
                router.push(`/user/${item.matchedUser.userHandle}`);
              }
            }}
            onDismiss={() => handleDismiss(item.matchId)}
          />
        </AnimatedEntry>
      )}
      ListFooterComponent={<View style={{ height: tabBarSpace }} />}
    />
  );
}

function MatchCard({
  match,
  onMessage,
  onViewProfile,
  onDismiss,
}: {
  match: BeaconMatch;
  onMessage: () => void;
  onViewProfile: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const score = Math.round(parseFloat(match.similarityScore) * 100);

  return (
    <GlassCard glowColor={COLORS.borderGlow} style={{ marginBottom: 12 }}>
      <View style={styles.matchHeader}>
        <LinearGradient
          colors={[...COLORS.gradientAccent]}
          style={styles.scoreCircle}
        >
          <View style={[styles.scoreInner, { backgroundColor: colors.background }]}>
            <Text style={[styles.scoreText, { color: COLORS.accent }]}>{score}%</Text>
          </View>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.matchedBeaconText, { color: colors.text }]} numberOfLines={2}>
            {match.matchedUser?.rawText}
          </Text>
          <TouchableOpacity onPress={onViewProfile}>
            <Text style={[styles.matchedHandle, { color: COLORS.primary }]}>
              @{match.matchedUser?.userHandle}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.dismissText, { color: colors.textMuted }]}>✕</Text>
        </TouchableOpacity>
      </View>

      {match.matchReason && (
        <View style={[styles.matchReasonCard, { backgroundColor: colors.surfaceGlass }]}>
          <Text style={[styles.matchReason, { color: colors.textMuted }]}>
            {match.matchReason}
          </Text>
        </View>
      )}

      <PillButton
        title="Start Conversation"
        onPress={onMessage}
        variant="primary"
        size="md"
        style={{ width: '100%' }}
      />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggleContainer: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.sm,
  },
  scrollContent: { padding: SPACING.page, gap: SPACING.md },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  explainerInner: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  explainerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.glow(COLORS.accent),
  },
  explainerTitle: { fontSize: 18, fontFamily: FONTS.semiBold, textAlign: 'center' },
  explainerBody: { fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  inputSection: { gap: SPACING.sm, alignSelf: 'stretch' },
  beaconInput: {
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  beaconInputText: {
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  exampleToggle: { fontSize: 13, fontFamily: FONTS.medium },
  examplesScroll: { marginTop: 4 },
  exampleChip: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    maxWidth: 240,
  },
  exampleChipText: { fontSize: 13, fontFamily: FONTS.regular },
  limitReachedText: { fontSize: 14, fontFamily: FONTS.regular, lineHeight: 22 },
  beaconList: { gap: 12 },
  sectionTitle: { fontSize: 11, fontFamily: FONTS.semiBold, textTransform: 'uppercase', letterSpacing: 1 },
  beaconCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  beaconStatus: { fontSize: 12, fontFamily: FONTS.semiBold, flex: 1 },
  beaconText: { fontSize: 15, fontFamily: FONTS.medium, lineHeight: 22 },
  parsedIntent: { fontSize: 13, fontFamily: FONTS.regular, fontStyle: 'italic', lineHeight: 20, marginTop: 4 },
  lastMatched: { fontSize: 12, fontFamily: FONTS.regular, marginTop: 4 },
  emptyMatches: { flex: 1, padding: SPACING.xl, justifyContent: 'center' },
  emptyInner: { alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptyBody: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  matchHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontSize: 14, fontFamily: FONTS.bold },
  matchedBeaconText: { fontSize: 14, fontFamily: FONTS.medium, lineHeight: 20 },
  matchedHandle: { fontSize: 13, fontFamily: FONTS.semiBold, marginTop: 4 },
  matchReasonCard: {
    borderRadius: RADIUS.md,
    padding: 10,
    marginBottom: 12,
  },
  matchReason: { fontSize: 13, fontFamily: FONTS.regular, lineHeight: 20 },
  dismissButton: { padding: 4, alignSelf: 'flex-start' },
  dismissText: { fontSize: 16, fontFamily: FONTS.regular },
});
