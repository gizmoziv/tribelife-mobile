import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { beacons as beaconsApi } from '@/services/api';
import { FONTS, COLORS, BEACON_EXAMPLES, FREE_BEACON_LIMIT, PREMIUM_BEACON_LIMIT } from '@/constants';
import type { Beacon, BeaconMatch } from '@/types';

type Tab = 'beacons' | 'matches';

export default function BeaconScreen() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('beacons');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab]}
          onPress={() => setActiveTab('beacons')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'beacons' ? COLORS.accent : colors.textMuted }]}>
            My Beacons
          </Text>
          {activeTab === 'beacons' && <View style={[styles.tabIndicator, { backgroundColor: COLORS.accent }]} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab]}
          onPress={() => setActiveTab('matches')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'matches' ? COLORS.accent : colors.textMuted }]}>
            Matches
          </Text>
          {activeTab === 'matches' && <View style={[styles.tabIndicator, { backgroundColor: COLORS.accent }]} />}
        </TouchableOpacity>
      </View>

      {activeTab === 'beacons' ? <MyBeaconsPanel /> : <MatchesPanel />}
    </SafeAreaView>
  );
}

// ── My Beacons Panel ──────────────────────────────────────────────────────
function MyBeaconsPanel() {
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const router = useRouter();
  const [myBeacons, setMyBeacons] = useState<Beacon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  const isPremium = user?.isPremium ?? false;
  const activeBeacons = myBeacons.filter((b) => b.isActive);
  const limit = isPremium ? PREMIUM_BEACON_LIMIT : FREE_BEACON_LIMIT;
  const canAddMore = activeBeacons.length < limit;

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
        '🏠 Beacon Lit!',
        "Your beacon has been posted. We'll notify you when we find a match.",
        [{ text: 'Great!' }]
      );
    } catch (err: any) {
      if (err.data?.upgradeRequired) {
        Alert.alert(
          'Upgrade to Premium',
          `Free accounts can run ${FREE_BEACON_LIMIT} beacon at a time. Premium unlocks ${PREMIUM_BEACON_LIMIT} beacons for $4.99/month.`,
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
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {/* Explainer */}
      <View style={[styles.explainer, { backgroundColor: colors.surface, borderColor: COLORS.accent }]}>
        <Image source={require('@/assets/tribelife-logo.png')} style={styles.explainerImage} />
        <Text style={[styles.explainerTitle, { color: colors.text }]}>What is a Beacon?</Text>
        <Text style={[styles.explainerBody, { color: colors.textMuted }]}>
          A beacon is a short description of something you're looking for or offering. Every 24 hours, we match your beacon with others in your timezone using AI.
        </Text>
        <View style={[styles.limitBadge, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.limitText, { color: COLORS.accent }]}>
            {activeBeacons.length}/{limit} beacons active
            {!isPremium && ' (Free plan)'}
          </Text>
        </View>
      </View>

      {/* Input (only if can add more) */}
      {canAddMore ? (
        <View style={styles.inputSection}>
          <TextInput
            style={[styles.beaconInput, {
              backgroundColor: colors.surface,
              color: colors.text,
              borderColor: inputText.length >= 10 ? COLORS.accent : colors.border,
              fontFamily: FONTS.regular,
            }]}
            placeholder="e.g. I want to find people to play chess in the evenings"
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={280}
          />
          <View style={styles.inputMeta}>
            <TouchableOpacity onPress={() => setShowExamples(!showExamples)}>
              <Text style={[styles.exampleToggle, { color: COLORS.accent }]}>
                {showExamples ? 'Hide examples ↑' : 'See examples ↓'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.charCount, { color: colors.textMuted }]}>
              {inputText.length}/280
            </Text>
          </View>

          {showExamples && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.examplesScroll}
            >
              {BEACON_EXAMPLES.map((ex) => (
                <TouchableOpacity
                  key={ex}
                  style={[styles.exampleChip, { backgroundColor: colors.surface, borderColor: COLORS.accent }]}
                  onPress={() => setInputText(ex)}
                >
                  <Text style={[styles.exampleChipText, { color: colors.text }]}>{ex}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={[
              styles.submitButton,
              { opacity: inputText.trim().length >= 10 && !isSubmitting ? 1 : 0.5 },
            ]}
            onPress={handleSubmit}
            disabled={inputText.trim().length < 10 || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>Light Beacon ✨</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.limitReached, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.limitReachedText, { color: colors.textMuted }]}>
            {isPremium
              ? `You have ${PREMIUM_BEACON_LIMIT} active beacons (maximum for premium).`
              : `You have ${FREE_BEACON_LIMIT} active beacon. Upgrade to Premium to run up to ${PREMIUM_BEACON_LIMIT}.`}
          </Text>
        </View>
      )}

      {/* Existing beacons */}
      {myBeacons.length > 0 && (
        <View style={styles.beaconList}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Your Beacons</Text>
          {myBeacons.map((beacon) => (
            <BeaconCard
              key={beacon.id}
              beacon={beacon}
              onDeactivate={() => handleDeactivate(beacon.id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function BeaconCard({ beacon, onDeactivate }: { beacon: Beacon; onDeactivate: () => void }) {
  const { colors } = useTheme();
  const daysLeft = beacon.expiresAt
    ? Math.ceil((new Date(beacon.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <View style={[
      styles.beaconCard,
      {
        backgroundColor: colors.surface,
        borderColor: beacon.isActive ? COLORS.accent : colors.border,
        opacity: beacon.isActive ? 1 : 0.5,
      },
    ]}>
      <View style={styles.beaconCardHeader}>
        <View style={[styles.statusDot, { backgroundColor: beacon.isActive ? COLORS.accent : colors.textMuted }]} />
        <Text style={[styles.beaconStatus, { color: beacon.isActive ? COLORS.accent : colors.textMuted }]}>
          {beacon.isActive ? 'Active' : 'Inactive'}
        </Text>
        {beacon.isActive && daysLeft !== null && (
          <Text style={[styles.beaconExpiry, { color: colors.textMuted }]}>
            {daysLeft}d left
          </Text>
        )}
        {beacon.isActive && (
          <TouchableOpacity onPress={onDeactivate} style={styles.removeButton}>
            <Text style={{ color: COLORS.error, fontSize: 13, fontFamily: FONTS.medium }}>Remove</Text>
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
    </View>
  );
}

// ── Matches Panel ─────────────────────────────────────────────────────────
function MatchesPanel() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
  const [matches, setMatches] = useState<BeaconMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    beaconsApi.getMatches().then(({ matches: m }) => {
      setMatches(m);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  if (isLoading) return <View style={styles.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  if (matches.length === 0) {
    return (
      <View style={styles.emptyMatches}>
        <Image source={require('@/assets/tribelife-logo.png')} style={{ width: 48, height: 48, borderRadius: 10 }} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches yet</Text>
        <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
          We run matching daily at 6 AM UTC. Light a beacon and check back tomorrow!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={matches}
      keyExtractor={(item) => item.matchId.toString()}
      contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
      renderItem={({ item }) => (
        <MatchCard
          match={item}
          onMessage={async () => {
            if (!item.matchedUser) return;
            router.push({
              pathname: '/(app)/chat/[conversationId]',
              params: { conversationId: item.matchedUser.userId, handle: item.matchedUser.userHandle },
            });
          }}
          onViewProfile={() => {
            if (item.matchedUser?.userHandle) {
              router.push(`/user/${item.matchedUser.userHandle}`);
            }
          }}
        />
      )}
    />
  );
}

function MatchCard({
  match,
  onMessage,
  onViewProfile,
}: {
  match: BeaconMatch;
  onMessage: () => void;
  onViewProfile: () => void;
}) {
  const { colors } = useTheme();
  const score = Math.round(parseFloat(match.similarityScore) * 100);

  return (
    <View style={[styles.matchCard, { backgroundColor: colors.surface, borderColor: COLORS.accent }]}>
      <View style={styles.matchHeader}>
        <View style={[styles.scoreCircle, { borderColor: COLORS.accent }]}>
          <Text style={[styles.scoreText, { color: COLORS.accent }]}>{score}%</Text>
        </View>
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
      </View>

      {match.matchReason && (
        <Text style={[styles.matchReason, { color: colors.textMuted }]}>
          💡 {match.matchReason}
        </Text>
      )}

      <View style={styles.matchActions}>
        <TouchableOpacity
          style={[styles.messageButton, { backgroundColor: COLORS.primary }]}
          onPress={onMessage}
        >
          <Text style={styles.messageButtonText}>Start Conversation</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    position: 'relative',
  },
  tabText: { fontSize: 14, fontFamily: FONTS.semiBold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
  scrollContent: { padding: 16, gap: 16 },
  explainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  explainerImage: { width: 32, height: 32, borderRadius: 8 },
  explainerTitle: { fontSize: 18, fontFamily: FONTS.bold, textAlign: 'center' },
  explainerBody: { fontSize: 14, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  limitBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  limitText: { fontSize: 12, fontFamily: FONTS.semiBold },
  inputSection: { gap: 10 },
  beaconInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  exampleToggle: { fontSize: 13, fontFamily: FONTS.medium },
  charCount: { fontSize: 12, fontFamily: FONTS.regular },
  examplesScroll: { marginTop: 4 },
  exampleChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    maxWidth: 240,
  },
  exampleChipText: { fontSize: 13, fontFamily: FONTS.regular },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitButtonText: { color: '#0F172A', fontSize: 16, fontFamily: FONTS.bold },
  limitReached: { borderRadius: 14, borderWidth: 1, padding: 16 },
  limitReachedText: { fontSize: 14, fontFamily: FONTS.regular, lineHeight: 22 },
  beaconList: { gap: 12 },
  sectionTitle: { fontSize: 12, fontFamily: FONTS.semiBold, textTransform: 'uppercase', letterSpacing: 1 },
  beaconCard: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 8 },
  beaconCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  beaconStatus: { fontSize: 12, fontFamily: FONTS.semiBold, flex: 1 },
  beaconExpiry: { fontSize: 12, fontFamily: FONTS.regular },
  removeButton: { marginLeft: 8 },
  beaconText: { fontSize: 15, fontFamily: FONTS.medium, lineHeight: 22 },
  parsedIntent: { fontSize: 13, fontFamily: FONTS.regular, fontStyle: 'italic', lineHeight: 20 },
  lastMatched: { fontSize: 12, fontFamily: FONTS.regular },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyMatches: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptyBody: { fontSize: 15, fontFamily: FONTS.regular, textAlign: 'center', lineHeight: 22 },
  matchCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 12, gap: 12 },
  matchHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontSize: 14, fontFamily: FONTS.bold },
  matchedBeaconText: { fontSize: 14, fontFamily: FONTS.medium, lineHeight: 20 },
  matchedHandle: { fontSize: 13, fontFamily: FONTS.semiBold, marginTop: 4 },
  matchReason: { fontSize: 13, fontFamily: FONTS.regular, lineHeight: 20 },
  matchActions: { flexDirection: 'row', gap: 10 },
  messageButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  messageButtonText: { color: '#FFF', fontSize: 14, fontFamily: FONTS.semiBold },
});
