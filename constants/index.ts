export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const COLORS = {
  primary: '#6366F1',       // Indigo
  primaryDark: '#4F46E5',
  secondary: '#10B981',     // Emerald
  accent: '#F59E0B',        // Amber — beacon glow
  background: '#0F172A',    // Dark navy
  surface: '#1E293B',
  surfaceLight: '#334155',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#334155',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',

  // Light mode
  lightBackground: '#F8FAFC',
  lightSurface: '#FFFFFF',
  lightSurfaceAlt: '#F1F5F9',
  lightText: '#0F172A',
  lightTextMuted: '#64748B',
  lightBorder: '#E2E8F0',
} as const;

export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const BEACON_EXAMPLES = [
  'I am looking for a babysitter on weekends',
  'I want to find people to play chess',
  'I have an off-market house for sale',
  'Looking for a dog walker in my area',
  'Offering piano lessons for beginners',
  'Need help moving next weekend',
  'Want to start a book club',
  'Looking for a running partner',
] as const;

export const PREMIUM_PRICE = '$4.99/month';
export const FREE_BEACON_LIMIT = 1;
export const PREMIUM_BEACON_LIMIT = 3;
