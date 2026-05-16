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

// Per-room visual config for Community / Chats list globe icons. Two-stop
// soft gradient + a stylized continent silhouette per region. Desaturated
// from the original solid tints (v1.7) for a more premium read in dense
// lists. Town Square keeps the warm-amber identity from the v1.5 globe.
export type GlobeRoomVisual = {
  gradient: readonly [string, string];
  silhouette?: string; // SVG path data on a 24x24 viewBox; omit for town-square (renders generic globe glyph instead)
};

export const GLOBE_ROOM_VISUALS: Record<string, GlobeRoomVisual> = {
  'town-square': {
    gradient: ['#FFC974', '#E5A23A'],
  },
  'north-america': {
    gradient: ['#7AA9F0', '#4A7DC8'],
    // Wide Canada top tapering through US to a Mexico tip.
    silhouette: 'M3.5 5 L9 4 L15 4 L20.5 5 L20 8 L17.5 10 L17 13 L14.5 15.5 L12.5 18 L10.5 20 L9 17 L7.5 14 L5.5 11 L3.5 8 Z',
  },
  'israel': {
    gradient: ['#86CDEC', '#4FA3CA'],
    // Narrow north-south sliver — Israel's distinctive elongated shape.
    silhouette: 'M11 4 L12.5 4 L13.5 7 L14 11 L13.5 15 L12.5 18 L11.5 20.5 L10 18 L10 14 L10.5 10 Z',
  },
  'europe': {
    gradient: ['#B9A8F3', '#8C7AD9'],
    // Western/central Europe blob with Iberian peninsula bulge and Italy tail.
    silhouette: 'M5 7 L7 5 L11 4.5 L15 4.5 L18 6 L20 8 L19.5 11 L17 12 L15 14 L13.5 17 L12.5 19 L11 17 L9.5 15 L7 14 L5 12 L4 9.5 Z',
  },
  'uk-ireland': {
    gradient: ['#F09494', '#C76868'],
    // British Isles — UK on the right with Scotland top, Ireland (separate blob) on the left.
    silhouette: 'M14 3.5 Q16.5 5 16.5 8 Q17.5 11 16 14 Q14.5 17 13 16.5 Q11.5 15 11.5 12 Q11.5 8 12.5 5 Q13 3.5 14 3.5 Z M6.5 10 Q8.5 9.5 8.5 12 Q9 14 7 14.5 Q4.5 14 4.5 12 Q4.5 10 6.5 10 Z',
  },
  'latin-america': {
    gradient: ['#F2AE74', '#D8854C'],
    // Mexico + Central + South America — tapering wedge down to Patagonia.
    silhouette: 'M8 4 L14 4 L15.5 6.5 L14 9 L13.5 12 L12.5 15 L11.5 18 L10.5 20.5 L10 18 L10.5 15 L10 12 L9 9 L8 6.5 Z',
  },
  'australia-nz': {
    gradient: ['#6CD6C3', '#36AC96'],
    // Australia main body + small NZ off to the southeast (two separate blobs).
    silhouette: 'M3.5 8 Q5.5 5.5 9 5.5 Q14 5.5 17 7 Q19 9 18 12 Q15 13.5 12 13 Q8 13 5.5 11.5 Q3.5 10.5 3.5 8 Z M19 15 Q20.5 14.5 20.5 16 Q20.5 17.5 19.5 18 Q18.5 17.5 19 15 Z M18 19 Q19.5 18.5 20 20 Q19.5 21 18.5 20.5 Z',
  },
  'south-africa': {
    gradient: ['#F0ABC9', '#C77899'],
    // Southern Africa wedge — wider top tapering to the cape.
    silhouette: 'M7 5 L17 5 L18 8 L17.5 11 L16 14 L14 16.5 L12 18.5 L10 16.5 L8 14 L7 11 Z',
  },
};

// Backwards-compat tint map — derived from the gradient's first stop so old
// consumers (single-color avatars, badges) keep working without touching them.
export const GLOBE_ROOM_TINTS: Record<string, string> = Object.fromEntries(
  Object.entries(GLOBE_ROOM_VISUALS).map(([slug, v]) => [slug, v.gradient[0]]),
);

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
