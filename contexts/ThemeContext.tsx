import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants';

type Theme = 'light' | 'dark';

interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceGlass: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  borderGlow: string;
  primary: string;
  primaryGlow: string;
  secondary: string;
  accent: string;
  accentGlow: string;
  accentSoft: string;
  error: string;
  success: string;
  warning: string;
}

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
}

const darkColors = {
  background: COLORS.background,
  surface: COLORS.surface,
  surfaceElevated: COLORS.surfaceElevated,
  surfaceGlass: COLORS.surfaceGlass,
  surfaceAlt: COLORS.surfaceLight,
  text: COLORS.text,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  borderGlow: COLORS.borderGlow,
  primary: COLORS.primary,
  primaryGlow: COLORS.primaryGlow,
  secondary: COLORS.secondary,
  accent: COLORS.accent,
  accentGlow: COLORS.accentGlow,
  accentSoft: COLORS.accentSoft,
  error: COLORS.error,
  success: COLORS.success,
  warning: COLORS.warning,
};

const lightColors = {
  background: COLORS.lightBackground,
  surface: COLORS.lightSurface,
  surfaceElevated: COLORS.lightSurfaceElevated,
  surfaceGlass: COLORS.lightSurfaceGlass,
  surfaceAlt: '#F1F5F9',
  text: COLORS.lightText,
  textMuted: COLORS.lightTextMuted,
  border: COLORS.lightBorder,
  borderGlow: 'rgba(245,158,11,0.2)',
  primary: COLORS.primary,
  primaryGlow: COLORS.primaryGlow,
  secondary: COLORS.secondary,
  accent: COLORS.accent,
  accentGlow: COLORS.accentGlow,
  accentSoft: COLORS.accentSoft,
  error: COLORS.error,
  success: COLORS.success,
  warning: COLORS.warning,
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = 'tribelife_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    });
  }, []);

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        toggleTheme,
        colors: theme === 'dark' ? darkColors : lightColors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
