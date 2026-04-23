import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS, COLORS, RADIUS, SHADOWS, SPACING } from '@/constants';
import { AvatarCircle } from '@/components/ui/AvatarCircle';
import { usersApi } from '@/services/api';

export type MentionScope = 'timezone' | 'globe' | 'group' | 'dm';

interface MentionUser {
  userId: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
}

interface MentionAutocompleteProps {
  text: string;
  selection: { start: number; end: number };
  scope: MentionScope;
  contextId: string;
  onSelect: (newText: string, newCursor: number) => void;
}

/**
 * Detect an active @mention token at the cursor.
 * Returns { start, query } where start is the index of the `@` and
 * query is everything between `@` and cursor. Returns null if none.
 */
function getActiveMention(text: string, cursor: number): { start: number; query: string } | null {
  if (cursor <= 0) return null;

  // Walk backward from cursor to find `@`
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      // Must be at start OR preceded by whitespace
      if (i === 0 || /\s/.test(text[i - 1])) {
        const query = text.slice(i + 1, cursor);
        // If query contains whitespace, we're past the token
        if (/\s/.test(query)) return null;
        // Only allow valid handle chars
        if (!/^[a-zA-Z0-9_]*$/.test(query)) return null;
        return { start: i, query: query.toLowerCase() };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

export function MentionAutocomplete({
  text,
  selection,
  scope,
  contextId,
  onSelect,
}: MentionAutocompleteProps) {
  const { colors } = useTheme();
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeStart, setActiveStart] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const active = getActiveMention(text, selection.start);
    if (!active) {
      setVisible(false);
      setActiveStart(null);
      return;
    }

    setActiveStart(active.start);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      usersApi
        .suggest(active.query, scope, contextId)
        .then(({ users }) => {
          setUsers(users);
          setVisible(users.length > 0);
        })
        .catch(() => {
          setUsers([]);
          setVisible(false);
        })
        .finally(() => setLoading(false));
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, selection.start, scope, contextId]);

  const handleSelect = (user: MentionUser) => {
    if (activeStart === null) return;
    const before = text.slice(0, activeStart);
    const after = text.slice(selection.start);
    const insert = `@${user.handle} `;
    const newText = before + insert + after;
    const newCursor = activeStart + insert.length;
    setVisible(false);
    onSelect(newText, newCursor);
  };

  if (!visible) return null;

  return (
    <View style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
      {loading && users.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 240 }}
        >
          {users.map((u) => (
            <TouchableOpacity
              key={u.userId}
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => handleSelect(u)}
              activeOpacity={0.7}
            >
              <AvatarCircle
                name={u.handle}
                size={32}
                imageUrl={u.avatarUrl ?? undefined}
                showRing={false}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {u.name}
                </Text>
                <Text style={[styles.handle, { color: COLORS.primary }]} numberOfLines={1}>
                  @{u.handle}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    position: 'absolute',
    left: SPACING.page,
    right: SPACING.page,
    bottom: '100%',
    marginBottom: 6,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  loading: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  handle: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    marginTop: 1,
  },
});

export default MentionAutocomplete;
