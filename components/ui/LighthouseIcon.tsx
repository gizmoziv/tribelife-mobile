import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

interface LighthouseIconProps {
  color: string;
  focused?: boolean;
  size?: number;
}

/**
 * Custom lighthouse SVG icon for the Beacon tab.
 * The beacon pulses amber when focused (handled via opacity in parent).
 */
export function LighthouseIcon({ color, focused = false, size = 26 }: LighthouseIconProps) {
  const strokeColor = focused ? '#F59E0B' : color;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* Lighthouse body */}
        <Rect x="9" y="10" width="6" height="11" rx="1" stroke={strokeColor} strokeWidth="1.8" />
        {/* Lighthouse tower */}
        <Path d="M10 10 L11 4 H13 L14 10" stroke={strokeColor} strokeWidth="1.8" strokeLinejoin="round" />
        {/* Light housing */}
        <Rect x="10" y="3" width="4" height="2" rx="0.5" stroke={strokeColor} strokeWidth="1.5" />
        {/* Light beams */}
        <Line x1="12" y1="3" x2="7" y2="0.5" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <Line x1="12" y1="3" x2="17" y2="0.5" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <Line x1="12" y1="4" x2="5" y2="3" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <Line x1="12" y1="4" x2="19" y2="3" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        {/* Base */}
        <Path d="M7 21 H17" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
        {/* Door */}
        <Rect x="10.5" y="16" width="3" height="5" rx="1.5" stroke={strokeColor} strokeWidth="1.2" />
        {/* Stripe detail */}
        <Line x1="9" y1="14" x2="15" y2="14" stroke={strokeColor} strokeWidth="1" />
      </Svg>
      {/* Amber glow dot when focused */}
      {focused && (
        <View style={styles.glowDot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowDot: {
    position: 'absolute',
    top: 1,
    left: '50%',
    marginLeft: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F59E0B',
  },
});
