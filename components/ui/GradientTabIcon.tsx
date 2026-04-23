import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Circle } from 'react-native-svg';

interface GradientTabIconProps {
  focused: boolean;
  icon: 'chat' | 'globe' | 'beacon' | 'news' | 'profile';
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

function renderPaths(icon: string, color: string) {
  switch (icon) {
    case 'chat':
      return <ChatPaths color={color} />;
    case 'globe':
      return <GlobePaths color={color} />;
    case 'beacon':
      return <BeaconPaths color={color} />;
    case 'news':
      return <NewsPaths color={color} />;
    case 'profile':
      return <ProfilePaths color={color} />;
    default:
      return null;
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
  // Bold flame icon — scaled up to match chat/profile visual weight
  return (
    <Path
      d="M12 0.5C5.5 8 4 11.5 4 15C4 19.7 7.58 23.5 12 23.5C16.42 23.5 20 19.7 20 15C20 11.5 18.5 8 12 0.5ZM12 20C9.79 20 8 18.25 8 16C8 14.1 9.4 11.8 12 8.5C14.6 11.8 16 14.1 16 16C16 18.25 14.21 20 12 20Z"
      fill={color}
    />
  );
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
