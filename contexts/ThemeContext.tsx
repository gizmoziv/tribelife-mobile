import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  colors: typeof darkColors;
}

const darkColors = {
  background: COLORS.background,
  surface: COLORS.surface,
  surfaceAlt: COLORS.surfaceLight,
  text: COLORS.text,
  textMuted: COLORS.textMuted,
  border: COLORS.border,
  primary: COLORS.primary,
  secondary: COLORS.secondary,
  accent: COLORS.accent,
  error: COLORS.error,
  success: COLORS.success,
};

const lightColors = {
  background: COLORS.lightBackground,
  surface: COLORS.lightSurface,
  surfaceAlt: COLORS.lightSurfaceAlt,
  text: COLORS.lightText,
  textMuted: COLORS.lightTextMuted,
  border: COLORS.lightBorder,
  primary: COLORS.primary,
  secondary: COLORS.secondary,
  accent: COLORS.accent,
  error: COLORS.error,
  success: COLORS.success,
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
