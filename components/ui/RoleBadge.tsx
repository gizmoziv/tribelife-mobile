import React from 'react';
import { GlowBadge } from './GlowBadge';
import { COLORS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import type { OrgRole } from '@/types';

interface RoleBadgeProps {
  role: OrgRole;
  size?: 'sm' | 'md';
}

const ROLE_LABEL: Record<OrgRole, string> = {
  admin: 'Admin',
  moderator: 'Moderator',
  member: 'Member',
};

export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  const { colors } = useTheme();
  const color =
    role === 'admin' ? COLORS.accent
    : role === 'moderator' ? COLORS.primary
    : colors.textMuted;
  return <GlowBadge text={ROLE_LABEL[role]} color={color} size={size} />;
}

export default RoleBadge;
