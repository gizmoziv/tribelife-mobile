// Stacked Public/Private chooser. Two radio-style cards stacked vertically.
// Shared between group creation and group info screens (CPO feedback: reads
// as a deliberate attribute decision rather than a tab switch).
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';

interface CardProps {
  selected: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onPress: () => void;
  premiumLocked?: boolean;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
}

export function VisibilityCard({
  selected,
  title,
  description,
  icon,
  onPress,
  premiumLocked = false,
  textColor,
  mutedColor,
  surfaceColor,
  borderColor,
}: CardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: surfaceColor,
        borderColor: selected ? COLORS.primary : borderColor,
        borderWidth: selected ? 2 : 1,
      }}
    >
      <View style={{ width: 28, alignItems: 'center', marginRight: SPACING.md }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 15, fontFamily: FONTS.semiBold, color: textColor }}>
            {title}
          </Text>
          {premiumLocked && (
            <View
              style={{
                backgroundColor: COLORS.accentSoft,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text style={{ fontSize: 10, fontFamily: FONTS.semiBold, color: COLORS.accent }}>
                PREMIUM
              </Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, fontFamily: FONTS.regular, color: mutedColor, marginTop: 2, lineHeight: 16 }}>
          {description}
        </Text>
      </View>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? COLORS.primary : borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: SPACING.sm,
        }}
      >
        {selected && (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: COLORS.primary,
            }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

export function GlobeRadioIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.7} />
      <Path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function LockRadioIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M6 11V8a6 6 0 0112 0v3" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M5 11h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}
