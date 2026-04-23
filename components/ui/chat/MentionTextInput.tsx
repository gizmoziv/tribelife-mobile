import React, { forwardRef } from 'react';
import { TextInput, Text, TextInputProps } from 'react-native';
import { COLORS, FONTS } from '@/constants';

const MENTION_REGEX = /@[a-zA-Z0-9_]+/g;

interface MentionTextInputProps extends TextInputProps {
  value: string;
  mentionColor?: string;
}

/**
 * TextInput variant that colorizes @handle tokens inline while the user types.
 * Uses React Native's supported pattern of passing styled <Text> children to
 * TextInput — onChangeText still receives plain text, so the controlled-input
 * contract is preserved.
 */
export const MentionTextInput = forwardRef<TextInput, MentionTextInputProps>(
  ({ value, mentionColor = COLORS.primary, style, ...rest }, ref) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    MENTION_REGEX.lastIndex = 0;
    while ((match = MENTION_REGEX.exec(value)) !== null) {
      const isAtStartOrAfterWs = match.index === 0 || /\s/.test(value[match.index - 1]);
      if (!isAtStartOrAfterWs) continue;
      if (match.index > lastIndex) {
        parts.push(value.slice(lastIndex, match.index));
      }
      parts.push(
        <Text key={match.index} style={{ color: mentionColor, fontFamily: FONTS.semiBold }}>
          {match[0]}
        </Text>,
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      parts.push(value.slice(lastIndex));
    }

    return (
      <TextInput ref={ref} style={style} {...rest}>
        <Text>{parts.length > 0 ? parts : value}</Text>
      </TextInput>
    );
  },
);

MentionTextInput.displayName = 'MentionTextInput';

export default MentionTextInput;
