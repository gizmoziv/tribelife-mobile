import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';
import type { ReactionGroup } from '@/types';

interface ReactionPillsProps {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
}

export function ReactionPills({ reactions, onToggle }: ReactionPillsProps) {
  const { colors } = useTheme();

  if (reactions.length === 0) return null;

  return (
    <View style={styles.container}>
      {reactions.map((reaction) => (
        <TouchableOpacity
          key={reaction.emoji}
          onPress={() => onToggle(reaction.emoji)}
          activeOpacity={0.7}
          style={[
            styles.pill,
            {
              backgroundColor: reaction.hasReacted
                ? colors.primary + '30'
                : colors.surfaceElevated,
              borderColor: reaction.hasReacted
                ? colors.primary
                : colors.border,
            },
          ]}
        >
          <Text style={styles.emoji}>{reaction.emoji}</Text>
          <Text
            style={[
              styles.count,
              {
                color: reaction.hasReacted ? colors.primary : colors.textMuted,
              },
            ]}
          >
            {reaction.count}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default ReactionPills;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
});
