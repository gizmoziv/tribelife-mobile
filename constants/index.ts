export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const COLORS = {
  // Core palette
  primary: '#818CF8',         // Softer indigo
  primaryDark: '#6366F1',
  primaryGlow: 'rgba(129,140,248,0.15)',
  secondary: '#34D399',       // Brighter emerald
  accent: '#F59E0B',          // Amber — beacon glow
  accentGlow: 'rgba(245,158,11,0.2)',
  accentSoft: 'rgba(245,158,11,0.12)',

  // Dark mode
  background: '#0A0E1A',
  surface: 'rgba(255,255,255,0.06)',
  surfaceElevated: 'rgba(255,255,255,0.10)',
  surfaceGlass: 'rgba(255,255,255,0.08)',
  surfaceLight: '#1E293B',
  text: '#F1F5F9',
  textMuted: '#7A8BA8',
  border: 'rgba(255,255,255,0.08)',
  borderGlow: 'rgba(245,158,11,0.3)',

  // Light mode
  lightBackground: '#F8FAFB',
  lightSurface: 'rgba(0,0,0,0.03)',
  lightSurfaceElevated: '#FFFFFF',
  lightSurfaceGlass: 'rgba(255,255,255,0.85)',
  lightText: '#0F172A',
  lightTextMuted: '#64748B',
  lightBorder: 'rgba(0,0,0,0.06)',

  // Status
  error: '#FB7185',           // Softer rose
  success: '#34D399',
  warning: '#FBBF24',

  // Gradients (arrays for LinearGradient)
  gradientPrimary: ['#818CF8', '#C084FC'] as const,
  gradientAccent: ['#F59E0B', '#F97316'] as const,
  gradientWarm: ['#F97316', '#FB7185'] as const,
  gradientBackground: ['#0A0E1A', '#1A1040'] as const,
} as const;

export const FONTS = {
  light: 'PlusJakartaSans_300Light',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  page: 20,    // Horizontal page padding
} as const;

export const RADIUS = {
  sm: 12,
  md: 20,
  lg: 24,
  xl: 28,
  pill: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  glow: (color: string = COLORS.accent) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  }),
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
