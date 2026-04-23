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
import Svg, { Path, G, Circle, Ellipse, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop } from 'react-native-svg';

// Animated flame — transforms drive a real-fire feel:
//   scaleY flicker (fast, small)  = the tongue stretching
//   translateY bob (slow)         = the whole flame rising and settling
//   rotate sway (slower)          = wind drift
// All use useNativeDriver=true so the loops run on the UI thread even while
// the JS thread is busy rendering beacon lists.
function FlameIcon({ size = 18 }: { size?: number }) {
  const scaleY = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const oscillate = (
      val: Animated.Value,
      min: number,
      max: number,
      duration: number,
      delay = 0,
    ) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: max,
            duration,
            delay,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: min,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

    const anims = [
      oscillate(scaleY, 0.94, 1.08, 280),
      oscillate(translateY, 0, -1.5, 700, 120),
      oscillate(rotate, -0.04, 0.04, 1100, 240),
    ];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [scaleY, translateY, rotate]);

  const rotateStr = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-57.2958deg', '57.2958deg'],
  });

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [{ translateY }, { scaleY }, { rotate: rotateStr }],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 22c4.97 0 8-3.03 8-7 0-2-1-3.5-2-5-1.5 1-2 2-2 2s-1-2-2-4c-1.5 2-3 4-3 7 0 1-1 2-2 2s-2-1-2-2c0-2.5 2-5 3-6-2 0-4 2-5 4-1 2-1 3-1 4 0 3.97 3.03 7 8 7z"
          stroke="#F59E0B"
          strokeWidth={1.5}
          fill="rgba(245,158,11,0.15)"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  );
}

// ── Hero flame (used in the "What is a Beacon?" explainer card) ───────────
// A *real* flame is layered. Outer cool-red tongue, inner orange body, hot
// yellow core, white-hot hotspot near the base — each independently scaling
// on slightly different timelines so the whole thing breathes asymmetrically
// instead of pulsing in lockstep. Four rising embers spawn at the flame base,
// drift upward, and fade — driven by looped translateY + opacity curves.
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// Logo-inspired paths: asymmetric single-tongue flame with a crest curling
// to the right (the signature "wave break" in the TribeLife mark) and a
// detached wisp on the lower-left. Inner layers nest inside the outer and
// shift slightly to the right so the highlight catches on one side — the
// same directional lighting the logo has.
const FLAME_OUTER =
  'M 50 108 C 32 108 20 98 18 82 C 14 68 20 56 30 50 C 20 38 26 22 38 18 C 44 8 58 8 60 20 C 66 12 76 18 72 32 C 82 36 86 58 82 76 C 80 98 72 108 50 108 Z';
const FLAME_MID =
  'M 52 100 C 40 100 32 92 30 80 C 28 68 32 58 40 52 C 32 42 38 28 46 26 C 50 20 60 22 60 32 C 66 26 72 34 68 44 C 74 52 76 68 72 80 C 70 94 62 100 52 100 Z';
const FLAME_INNER =
  'M 54 92 C 46 92 42 84 42 76 C 42 66 46 58 50 52 C 46 44 50 34 56 32 C 60 30 64 34 62 42 C 66 46 68 58 66 68 C 64 84 62 92 54 92 Z';
const FLAME_CORE =
  'M 56 54 C 52 58 50 64 52 70 C 54 74 60 72 60 66 C 60 60 60 56 56 54 Z';
// Detached curl on the lower-left — the distinctive flame wisp from the logo.
const FLAME_WISP =
  'M 22 82 C 12 78 10 68 16 64 C 22 68 24 76 22 82 Z';

function useFlickerLoop(
  val: Animated.Value,
  min: number,
  max: number,
  duration: number,
  delay = 0,
) {
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(val, {
          toValue: max,
          duration,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(val, {
          toValue: min,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [val, min, max, duration, delay]);
}

function HeroFlameIcon({ size = 56 }: { size?: number }) {
  // Each flame layer gets its own Animated.Value so they don't synchronize.
  const outerScale = useRef(new Animated.Value(1)).current;
  const midScale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;
  const coreScale = useRef(new Animated.Value(1)).current;
  const wispScale = useRef(new Animated.Value(1)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const haloPulse = useRef(new Animated.Value(0.7)).current;

  // Four embers. Each has a Y (rises from base → above flame) and an opacity
  // (fades in at the base, out as it rises). Staggered delays so they spawn
  // asymmetrically like a real fire throwing off sparks.
  const ember1Y = useRef(new Animated.Value(0)).current;
  const ember2Y = useRef(new Animated.Value(0)).current;
  const ember3Y = useRef(new Animated.Value(0)).current;
  const ember4Y = useRef(new Animated.Value(0)).current;
  const ember1Op = useRef(new Animated.Value(0)).current;
  const ember2Op = useRef(new Animated.Value(0)).current;
  const ember3Op = useRef(new Animated.Value(0)).current;
  const ember4Op = useRef(new Animated.Value(0)).current;

  // Flame layer flickers (fast → slow as you go outward mirrors real flame)
  useFlickerLoop(coreScale, 0.88, 1.18, 220, 0);
  useFlickerLoop(innerScale, 0.92, 1.12, 340, 120);
  useFlickerLoop(midScale, 0.95, 1.08, 520, 260);
  useFlickerLoop(outerScale, 0.97, 1.05, 780, 400);
  useFlickerLoop(wispScale, 0.8, 1.2, 620, 180);
  useFlickerLoop(sway, -0.06, 0.06, 1400, 0);
  useFlickerLoop(haloPulse, 0.55, 0.95, 1600, 0);

  // Embers: looped translateY from 0 → -50 with opacity curve
  useEffect(() => {
    const emberLoop = (yVal: Animated.Value, opVal: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(yVal, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(yVal, {
              toValue: -58,
              duration,
              delay,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opVal, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.timing(opVal, {
              toValue: 1,
              duration: duration * 0.3,
              delay,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(opVal, {
              toValue: 0,
              duration: duration * 0.7,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      );

    const loops = [
      emberLoop(ember1Y, ember1Op, 1800, 0),
      emberLoop(ember2Y, ember2Op, 2100, 500),
      emberLoop(ember3Y, ember3Op, 1600, 900),
      emberLoop(ember4Y, ember4Op, 2400, 1300),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [ember1Y, ember2Y, ember3Y, ember4Y, ember1Op, ember2Op, ember3Op, ember4Op]);

  const swayRotate = sway.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-57.2958deg', '57.2958deg'],
  });

  return (
    <Animated.View
      style={{
        width: size,
        height: size * 1.3,
        transform: [{ rotate: swayRotate }],
      }}
    >
      <Svg width={size} height={size * 1.3} viewBox="0 0 100 130" fill="none">
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="78%" r="55%">
            <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.55" />
            <Stop offset="0.6" stopColor="#F97316" stopOpacity="0.15" />
            <Stop offset="1" stopColor="#F97316" stopOpacity="0" />
          </RadialGradient>
          <SvgLinearGradient id="flameOuter" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor="#F97316" stopOpacity="0.9" />
            <Stop offset="0.6" stopColor="#EF4444" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#B91C1C" stopOpacity="0.85" />
          </SvgLinearGradient>
          <SvgLinearGradient id="flameMid" x1="0.5" y1="0.1" x2="0.5" y2="1">
            <Stop offset="0" stopColor="#FDE68A" stopOpacity="0.9" />
            <Stop offset="0.5" stopColor="#F59E0B" stopOpacity="0.98" />
            <Stop offset="1" stopColor="#EA580C" stopOpacity="0.95" />
          </SvgLinearGradient>
          <SvgLinearGradient id="flameInner" x1="0.5" y1="0.2" x2="0.5" y2="1">
            <Stop offset="0" stopColor="#FEF3C7" stopOpacity="1" />
            <Stop offset="0.7" stopColor="#FBBF24" stopOpacity="1" />
            <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.95" />
          </SvgLinearGradient>
          <SvgLinearGradient id="flameCore" x1="0.5" y1="0.3" x2="0.5" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.6" stopColor="#FEF3C7" stopOpacity="1" />
            <Stop offset="1" stopColor="#FDE68A" stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>

        {/* Soft radial halo that pulses behind the flame */}
        <AnimatedEllipse cx="50" cy="92" rx="44" ry="30" fill="url(#halo)" opacity={haloPulse} />

        {/* Detached wisp at the lower-left — the signature flame curl from
            the TribeLife logo. Lives slightly behind the main body so the
            outer flame partly overlaps it. Flickers on its own phase. */}
        <AnimatedG originX="18" originY="80" scaleY={wispScale}>
          <Path d={FLAME_WISP} fill="url(#flameMid)" opacity={0.9} />
        </AnimatedG>

        {/* Flame body — four layers, each flickering on its own phase.
            scaleY origin is near the base so layers stretch upward like real fire. */}
        <AnimatedG originX="50" originY="108" scaleY={outerScale}>
          <Path d={FLAME_OUTER} fill="url(#flameOuter)" opacity={0.9} />
        </AnimatedG>
        <AnimatedG originX="52" originY="100" scaleY={midScale}>
          <Path d={FLAME_MID} fill="url(#flameMid)" />
        </AnimatedG>
        <AnimatedG originX="54" originY="92" scaleY={innerScale}>
          <Path d={FLAME_INNER} fill="url(#flameInner)" />
        </AnimatedG>
        <AnimatedG originX="56" originY="70" scaleY={coreScale}>
          <Path d={FLAME_CORE} fill="url(#flameCore)" />
        </AnimatedG>

        {/* Embers — rise from within the fire body, fade as they climb.
            Spawn points scatter across the flame body so they feel like
            ash kicked up by a bonfire, not a single wick's smoke trail. */}
        <AnimatedG transform={[{ translateY: ember1Y }]}>
          <AnimatedCircle cx="36" cy="72" r="1.8" fill="#FDE68A" opacity={ember1Op} />
        </AnimatedG>
        <AnimatedG transform={[{ translateY: ember2Y }]}>
          <AnimatedCircle cx="62" cy="66" r="2.2" fill="#F59E0B" opacity={ember2Op} />
        </AnimatedG>
        <AnimatedG transform={[{ translateY: ember3Y }]}>
          <AnimatedCircle cx="50" cy="58" r="1.5" fill="#FFFFFF" opacity={ember3Op} />
        </AnimatedG>
        <AnimatedG transform={[{ translateY: ember4Y }]}>
          <AnimatedCircle cx="44" cy="78" r="1.3" fill="#FDE68A" opacity={ember4Op} />
        </AnimatedG>
      </Svg>
    </Animated.View>
  );
}

type Tab = 'beacons' | 'matches';

export default function BeaconScreen() {
  const { colors } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>(
    tab === 'matches' ? 'matches' : 'beacons',
  );
  const tabIndex = activeTab === 'beacons' ? 0 : 1;

  // Lift match state here so it survives tab switches (MatchesPanel unmounting)
  const [matches, setMatches] = useState<BeaconMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  useEffect(() => {
    beaconsApi
      .getMatches()
      .then(({ matches: m }) => {
        setMatches(m);
        setMatchesLoading(false);
      })
      .catch(() => setMatchesLoading(false));
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
    } catch {}
    setIsLoading(false);
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || text.length < 10) {
      Alert.alert(
        'Too Short',
        'Please describe your beacon in at least 10 characters.',
      );
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
        [{ text: 'Great!' }],
      );
    } catch (err: any) {
      if (err.data?.upgradeRequired) {
        Alert.alert(
          'Upgrade to Premium',
          `Free accounts can run 1 beacon at a time. Premium unlocks 3 beacons for $4.99/month.`,
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/(app)/profile') },
          ],
        );
      } else {
        Alert.alert(
          'Beacon Not Posted',
          err.message ?? 'Something went wrong. Please try again.',
          [{ text: 'OK' }],
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (beaconId: number) => {
    Alert.alert(
      'Remove Beacon',
      'Are you sure you want to remove this beacon?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await beaconsApi.deactivate(beaconId);
            setMyBeacons((prev) =>
              prev.map((b) =>
                b.id === beaconId ? { ...b, isActive: false } : b,
              ),
            );
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      {/* Explainer */}
      <AnimatedEntry>
        <GlassCard glowColor={COLORS.borderGlow}>
          <View style={styles.explainerInner}>
            <View style={styles.explainerIconWrap}>
              <HeroFlameIcon size={56} />
            </View>
            <Text style={[styles.explainerTitle, { color: colors.text }]}>
              What is a Beacon?
            </Text>
            <Text style={[styles.explainerBody, { color: colors.textMuted }]}>
              A beacon is a short description of something you're looking for or
              offering. Every 24 hours, we match your beacon with others in your
              timezone.
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
          <View
            style={[
              styles.beaconInput,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor:
                  inputText.length >= 10 ? COLORS.accent : colors.border,
              },
            ]}
          >
            <TextInput
              style={[
                styles.beaconInputText,
                { color: colors.text, fontFamily: FONTS.regular },
              ]}
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
            <GlowBadge
              text={`${inputText.length}/280`}
              color={colors.textMuted}
              size="sm"
            />
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
                  style={[
                    styles.exampleChip,
                    {
                      backgroundColor: colors.surfaceGlass,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setInputText(ex)}
                >
                  <Text
                    style={[styles.exampleChipText, { color: colors.text }]}
                  >
                    {ex}
                  </Text>
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
            <Text
              style={[styles.limitReachedText, { color: colors.textMuted }]}
            >
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
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Your Beacons
          </Text>
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

function BeaconCard({
  beacon,
  onDeactivate,
}: {
  beacon: Beacon;
  onDeactivate: () => void;
}) {
  const { colors } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const daysLeft = beacon.expiresAt
    ? Math.ceil(
        (new Date(beacon.expiresAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  useEffect(() => {
    if (beacon.isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.8,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
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
          <Animated.View
            style={[
              styles.statusDot,
              { backgroundColor: COLORS.accent, opacity: pulseAnim },
            ]}
          />
        )}
        {!beacon.isActive && (
          <View
            style={[styles.statusDot, { backgroundColor: colors.textMuted }]}
          />
        )}
        <Text
          style={[
            styles.beaconStatus,
            { color: beacon.isActive ? COLORS.accent : colors.textMuted },
          ]}
        >
          {beacon.isActive ? 'Active' : 'Inactive'}
        </Text>
        {beacon.isActive && daysLeft !== null && (
          <GlowBadge
            text={`${daysLeft}d left`}
            color={colors.textMuted}
            size="sm"
          />
        )}
        {beacon.isActive && (
          <TouchableOpacity onPress={onDeactivate}>
            <GlowBadge text="Remove" color={COLORS.error} size="sm" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.beaconText, { color: colors.text }]}>
        {beacon.rawText}
      </Text>
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

  if (isLoading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );

  if (matches.length === 0) {
    return (
      <View style={styles.emptyMatches}>
        <AnimatedEntry>
          <GlassCard>
            <View style={styles.emptyInner}>
              <FlameIcon size={36} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No matches yet
              </Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                We run matching daily at 6 AM UTC. Light a beacon and check back
                tomorrow!
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
      contentContainerStyle={{
        paddingVertical: 12,
        paddingHorizontal: SPACING.page,
      }}
      renderItem={({ item, index }) => (
        <AnimatedEntry delay={index * 60}>
          <MatchCard
            match={item}
            onMessage={async () => {
              if (!item.matchedUser) return;
              try {
                const { conversationId } = await chat.getOrCreateConversation(
                  item.matchedUser.userId,
                );
                router.push({
                  pathname: '/(app)/chat/[conversationId]',
                  params: {
                    conversationId: conversationId.toString(),
                    handle: item.matchedUser.userHandle,
                  },
                });
              } catch {
                Alert.alert(
                  'Error',
                  'Could not start conversation. Please try again.',
                );
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
          <View
            style={[styles.scoreInner, { backgroundColor: colors.background }]}
          >
            <Text style={[styles.scoreText, { color: COLORS.accent }]}>
              {score}%
            </Text>
          </View>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.matchedBeaconText, { color: colors.text }]}
            numberOfLines={2}
          >
            {match.matchedUser?.rawText}
          </Text>
          <TouchableOpacity onPress={onViewProfile}>
            <Text style={[styles.matchedHandle, { color: COLORS.primary }]}>
              @{match.matchedUser?.userHandle}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.dismissText, { color: colors.textMuted }]}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      {match.matchReason && (
        <View
          style={[
            styles.matchReasonCard,
            { backgroundColor: colors.surfaceGlass },
          ]}
        >
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
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.glow(COLORS.accent),
  },
  explainerTitle: {
    fontSize: 18,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  explainerBody: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
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
  inputMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
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
  sectionTitle: {
    fontSize: 11,
    fontFamily: FONTS.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  beaconCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  beaconStatus: { fontSize: 12, fontFamily: FONTS.semiBold, flex: 1 },
  beaconText: { fontSize: 15, fontFamily: FONTS.medium, lineHeight: 22 },
  parsedIntent: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: 4,
  },
  lastMatched: { fontSize: 12, fontFamily: FONTS.regular, marginTop: 4 },
  emptyMatches: { flex: 1, padding: SPACING.xl, justifyContent: 'center' },
  emptyInner: { alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: FONTS.semiBold },
  emptyBody: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 22,
  },
  matchHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
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
