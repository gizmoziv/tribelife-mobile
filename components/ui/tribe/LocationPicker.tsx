// LocationPicker — city search typeahead + GPS capture for candle-lighting location.
// Used inside CandleLightingCard when needsLocation is true (or user taps "change").
// Calls tribeApi.searchCities (debounced) and tribeApi.setLocation on selection.
// GPS path: requestForegroundPermissionsAsync → getCurrentPositionAsync (Accuracy.Low)
// → setLocation(source:gps). Denial falls back to manual search — no dead-end.
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import Svg, { Path } from 'react-native-svg';
import { FONTS, SPACING, RADIUS, COLORS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { tribeApi, CityResult } from '@/services/api';

// ── Props ──────────────────────────────────────────────────────────────────────

type LocationPickerProps = {
  onLocationSet: () => void;
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function PinIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M12 10a2 2 0 100-4 2 2 0 000 4z"
        stroke={color}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LocationPicker({ onLocationSet }: LocationPickerProps) {
  const { colors, isDark } = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Manual search ─────────────────────────────────────────────────────────

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setSearchError(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (text.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await tribeApi.searchCities(text.trim());
        setResults(data.cities);
      } catch {
        setSearchError('City search failed — try again.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleCitySelect = useCallback(async (city: CityResult) => {
    setSaving(true);
    setSearchError(null);
    try {
      await tribeApi.setLocation({ geonameid: city.geonameid, source: 'manual' });
      onLocationSet();
    } catch {
      setSearchError('Could not save location — try again.');
    } finally {
      setSaving(false);
    }
  }, [onLocationSet]);

  // ── GPS capture ───────────────────────────────────────────────────────────

  const handleGps = useCallback(async () => {
    setGpsError(null);
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission denied — type your city below.');
        setGpsLoading(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });

      const { latitude: lat, longitude: lon } = pos.coords;

      // Best-effort reverse geocode for a human label; fall back gracefully.
      let label = 'Current location';
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (geo.length > 0) {
          const g = geo[0];
          const parts = [g.city || g.district || g.subregion, g.country].filter(Boolean);
          if (parts.length > 0) label = parts.join(', ');
        }
      } catch {
        // reverse geocode is best-effort — keep "Current location" label
      }

      await tribeApi.setLocation({ lat, lon, label, source: 'gps' });
      onLocationSet();
    } catch {
      setGpsError('Could not get your location — type your city below.');
    } finally {
      setGpsLoading(false);
    }
  }, [onLocationSet]);

  // ── Render ────────────────────────────────────────────────────────────────

  const inputBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
  const placeholderColor = isDark ? COLORS.textMuted : COLORS.lightTextMuted;

  return (
    <View style={styles.container}>

      {/* GPS button */}
      <TouchableOpacity
        style={[styles.gpsButton, { borderColor }]}
        onPress={handleGps}
        disabled={gpsLoading || saving}
        activeOpacity={0.75}
      >
        {gpsLoading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <PinIcon color={colors.accent} />
        )}
        <Text style={[styles.gpsButtonText, { color: colors.accent }]}>
          {gpsLoading ? 'Getting location…' : 'Use my location'}
        </Text>
      </TouchableOpacity>

      {gpsError ? (
        <Text style={[styles.inlineError, { color: colors.error ?? COLORS.error }]}>
          {gpsError}
        </Text>
      ) : null}

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: borderColor }]} />
        <Text style={[styles.dividerText, { color: placeholderColor }]}>or type a city</Text>
        <View style={[styles.dividerLine, { backgroundColor: borderColor }]} />
      </View>

      {/* Search input */}
      <View style={[styles.inputWrap, { backgroundColor: inputBg, borderColor }]}>
        <SearchIcon color={placeholderColor} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Search city…"
          placeholderTextColor={placeholderColor}
          value={query}
          onChangeText={handleQueryChange}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {searching ? (
          <ActivityIndicator size="small" color={placeholderColor} />
        ) : null}
      </View>

      {searchError ? (
        <Text style={[styles.inlineError, { color: colors.error ?? COLORS.error }]}>
          {searchError}
        </Text>
      ) : null}

      {/* Results list */}
      {results.length > 0 ? (
        <View style={[styles.resultsList, { borderColor, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.geonameid)}
            scrollEnabled={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.resultItem,
                  index < results.length - 1
                    ? [styles.resultItemBorder, { borderBottomColor: borderColor }]
                    : null,
                  saving ? { opacity: 0.5 } : null,
                ]}
                onPress={() => handleCitySelect(item)}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Text style={[styles.resultText, { color: colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  gpsButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  resultsList: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  resultItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultText: {
    fontFamily: FONTS.regular,
    fontSize: 15,
  },
  inlineError: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    marginTop: -2,
  },
});

export default LocationPicker;
