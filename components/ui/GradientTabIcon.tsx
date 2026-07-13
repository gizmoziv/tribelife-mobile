import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Circle } from 'react-native-svg';
import { BEACON_FLAME_PATH } from '@/constants/beaconFlame';

interface GradientTabIconProps {
  focused: boolean;
  icon: 'chat' | 'globe' | 'beacon' | 'news' | 'chai' | 'profile' | 'community';
  color: string;
  size?: number;
}

export function GradientTabIcon({ focused, icon, color, size = 26 }: GradientTabIconProps) {
  const inner = (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {focused && (
        <Defs>
          <SvgGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#9333EA" />
            <Stop offset="0.5" stopColor="#E879A0" />
            <Stop offset="1" stopColor="#F59E0B" />
          </SvgGradient>
        </Defs>
      )}
      {renderPaths(icon, focused ? 'url(#grad)' : color)}
    </Svg>
  );

  if (icon === 'beacon') {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <BeaconFlameWrapper size={size}>{inner}</BeaconFlameWrapper>
      </View>
    );
  }

  if (icon === 'chai') {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <ChaiBreatheWrapper size={size} active={focused}>{inner}</ChaiBreatheWrapper>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }]}>{inner}</View>
  );
}

// Drives the flame-like motion for the beacon tab icon. Same recipe as the
// hero flame: fast scaleY flicker, slow translateY bob, slower rotate sway —
// slightly smaller amplitudes so it reads at 26px without feeling jittery.
function BeaconFlameWrapper({ size, children }: { size: number; children: React.ReactNode }) {
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
      oscillate(scaleY, 0.95, 1.06, 300),
      oscillate(translateY, 0, -1, 720, 140),
      oscillate(rotate, -0.03, 0.03, 1100, 260),
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
      {children}
    </Animated.View>
  );
}

// Gentle "breathe" for the Chai (חי — "life") tab icon: a slow, subtle scale
// pulse that runs ONLY while the tab is selected, then eases back to rest when
// deselected. Sine in/out for an organic heartbeat feel; native driver so it
// stays smooth at tab size.
function ChaiBreatheWrapper({
  size,
  active,
  children,
}: {
  size: number;
  active: boolean;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      scale.stopAnimation();
      Animated.timing(scale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function renderPaths(icon: string, color: string) {
  switch (icon) {
    case 'chat':      return <ChatPaths color={color} />;
    case 'globe':     return <GlobePaths color={color} />;
    case 'beacon':    return <BeaconPaths color={color} />;
    case 'news':      return <NewsPaths color={color} />;
    case 'chai':      return <ChaiPaths color={color} />;
    case 'profile':   return <ProfilePaths color={color} />;
    case 'community': return <CommunityPaths color={color} />;
    default:          return null;
  }
}

function GlobePaths({ color }: { color: string }) {
  return (
    <>
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" fill="none" />
      <Path
        d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function ChatPaths({ color }: { color: string }) {
  return (
    <Path
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function BeaconPaths({ color }: { color: string }) {
  // Hollow flame traced from the CPO's hand-drawn reference. Outer silhouette
  // plus a self-shaped inner cutout → must render with fillRule="evenodd".
  return <Path d={BEACON_FLAME_PATH} fill={color} fillRule="evenodd" />;
}

function NewsPaths({ color }: { color: string }) {
  return (
    <>
      <Path
        d="M4 4.5h12l4 4V19a.5.5 0 0 1-.5.5h-15.5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M16 4.5v4h4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M7 12h10M7 14.5h10M7 17h6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </>
  );
}

// Chai (חי — "life"). Filled glyph vector-traced from the CPO's hand-drawn
// reference (potrace), rotated upright (the source photo was landscape), and
// normalized into the shared 24×24 viewBox — so the brand gradient floods the
// whole letterform when the tab is focused, same fill convention as the beacon
// flame. Three contours: the Chet body, the Chet's left leg, and the Yod.
const CHAI_D =
  'M20.72 7.08C20.71 6.53 20.67 6.09 20.63 5.91C20.59 5.75 20.53 5.38 20.49 5.11C20.42 4.57 20.41 4.54 20.24 4.06C20.06 3.55 19.79 3.19 19.49 3.03C18.83 2.69 18.05 2.58 17.3 2.71C16.73 2.81 15.53 3.08 15.24 3.16C15.09 3.21 14.54 3.34 14.03 3.44C13.15 3.62 13.06 3.63 12.41 3.63C11.45 3.62 10.61 3.54 10.33 3.4C9.86 3.19 9.44 2.65 9.38 2.2C9.36 2.07 9.33 1.96 9.31 1.95C9.22 1.89 8.76 2.71 8.52 3.35C8.31 3.93 8.22 5.49 8.36 6.15C8.43 6.48 8.67 6.97 8.84 7.13C8.99 7.27 9.6 7.57 9.91 7.65C10.63 7.83 11.84 7.83 12.84 7.66C13.2 7.59 13.73 7.52 14.17 7.48C14.32 7.47 14.68 7.41 14.96 7.35C15.82 7.19 15.83 7.18 16.09 7.3C16.4 7.44 16.74 7.81 16.98 8.27C17.16 8.63 17.16 8.63 17.2 9.46C17.26 10.65 17.18 12.92 17.03 14.1C17.01 14.28 16.98 14.75 16.96 15.15C16.93 15.96 16.89 16.6 16.77 17.91C16.53 20.47 16.48 21.29 16.51 21.73C16.54 22.13 16.61 22.11 16.99 21.63C17.44 21.07 17.51 21.01 17.97 20.61C18.4 20.24 18.57 20.12 19.13 19.76C20.21 19.08 20.18 19.12 20.18 18.35C20.18 18.02 20.2 17.56 20.22 17.34C20.24 17.12 20.28 16.6 20.3 16.19C20.33 15.78 20.38 15.15 20.41 14.78C20.45 14.42 20.49 13.86 20.52 13.53C20.54 13.2 20.58 12.75 20.6 12.53C20.72 11.41 20.78 8.91 20.72 7.08ZM12.59 7.67C12.52 7.6 12.46 7.6 11.92 7.65C11.17 7.71 10.6 7.71 10.13 7.65C9.4 7.55 9.38 7.6 9.32 9.66C9.24 11.44 9.16 20.78 9.22 21.75C9.26 22.47 9.29 22.5 9.6 22.08C9.92 21.64 10.72 20.79 11.11 20.46C11.46 20.16 12.11 19.52 12.38 19.2C12.51 19.04 12.52 19.01 12.49 18.8C12.46 18.56 12.52 16.42 12.6 14.87C12.63 14.34 12.65 12.68 12.66 11.18C12.67 7.86 12.66 7.74 12.59 7.67ZM6.93 4C6.86 3.73 6.7 3.45 6.47 3.22C6.13 2.85 6.01 2.81 5.16 2.8C3.84 2.77 3.52 2.46 3.52 1.14C3.52 0.67 3.51 0.41 3.47 0.38C3.43 0.36 3.25 0.5 3.05 0.71C1.49 2.34 1.39 6.86 2.88 8.52C3.35 9.04 4.13 9.18 4.63 8.87C5.37 8.39 6.41 6.88 6.82 5.7C6.94 5.3 7.01 4.32 6.93 4Z';

function ChaiPaths({ color }: { color: string }) {
  return <Path d={CHAI_D} fill={color} />;
}

function ProfilePaths({ color }: { color: string }) {
  return (
    <>
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2" />
      <Path
        d="M20 21a8 8 0 1 0-16 0"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  );
}

function CommunityPaths({ color }: { color: string }) {
  // Three-figure community silhouette: one central larger figure, two smaller
  // flanking figures. 24×24 viewBox to match every other icon. Mirrors the
  // stroked outline + filled circle-head convention of ProfilePaths so the
  // gradient fill renders consistently when the tab is focused.
  return (
    <>
      <Circle cx="12" cy="7" r="3" stroke={color} strokeWidth="2" />
      <Path
        d="M18 21a6 6 0 1 0-12 0"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Circle cx="5" cy="9" r="2" stroke={color} strokeWidth="1.6" />
      <Path
        d="M1.5 20a3.5 3.5 0 0 1 7 0"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <Circle cx="19" cy="9" r="2" stroke={color} strokeWidth="1.6" />
      <Path
        d="M15.5 20a3.5 3.5 0 0 1 7 0"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
