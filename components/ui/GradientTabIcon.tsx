import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Circle } from 'react-native-svg';

interface GradientTabIconProps {
  focused: boolean;
  icon: 'chat' | 'globe' | 'beacon' | 'profile';
  color: string;
  size?: number;
}

export function GradientTabIcon({ focused, icon, color, size = 26 }: GradientTabIconProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
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
    </View>
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
