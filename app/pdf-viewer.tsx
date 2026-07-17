import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import Pdf from 'react-native-pdf';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '@/constants';

// ── ROOT route placement (D-04, load-bearing — see 31-01-PLAN.md Task 3) ────
// This screen lives at app/pdf-viewer.tsx (a sibling of app/notifications.tsx,
// app/support.tsx, app/invite.tsx), NOT under app/(app)/. app/(app)/_layout.tsx
// is a Tabs navigator — placing this file there would register a spurious 6th
// bottom tab. The root Stack in app/_layout.tsx auto-registers file routes not
// explicitly listed (proven by notifications/support/invite), so no edit to
// app/_layout.tsx is needed. Route string is `/pdf-viewer`.

// __DEV__-only fallback so the on-device render checkpoint (Task 4 of this plan)
// can open this screen with no params supplied before the document card (Wave 2)
// exists to pass a real cdnUrl. Never reachable in production — the card always
// supplies cdnUrl + name.
const SAMPLE_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const SAMPLE_PDF_NAME = 'Sample.pdf';

/*
 * ── WEBVIEW FALLBACK (Plan B — documented here, NOT wired) ──────────────────
 * If the Task 4 on-device checkpoint finds react-native-pdf renders a blank
 * view on iOS and/or Android (RESEARCH Pitfall 1 — open, unresolved
 * New-Architecture "blank PDF" GitHub issues against this exact SDK-54/RN-0.81
 * combination), pivot this screen's render branch to react-native-webview
 * (already installed, zero new native deps) pointed at Google's embedded
 * viewer instead of <Pdf>:
 *
 *   `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(cdnUrl)}`
 *
 * Android's raw WebView component does not render PDF bytes natively (unlike
 * the Chrome *app*), so the Google-viewer route is required on Android too,
 * not just as an iOS-only patch. The route/props (`cdnUrl`, `name` params)
 * stay identical — only the render branch inside this file would change from
 * `<Pdf source={{ uri: localUri }} />` to a `<WebView source={{ uri: gviewUrl }} />`
 * pointed at the CDN url directly (no local download needed for that path).
 */

// Strip path separators, `..`, and control characters so the client-supplied
// original filename (attachments[].name — verbatim per the Phase 30 field
// contract) can't escape FileSystem.cacheDirectory when concatenated into a
// local path (RESEARCH Security — path-injection via attachment name).
function sanitizeCacheFilename(name: string): string {
  const stripped = name
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  return stripped.length > 0 ? stripped : 'document.pdf';
}

function BackIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

interface CustomHeaderProps {
  title: string;
  onBack: () => void;
  colors: { background: string; surfaceGlass: string; text: string; textMuted: string };
  insetsTop: number;
}

// Inline header (back pill + centered title), matching the project convention
// used across chat screens (e.g. globe/[roomSlug].tsx) — NOT a Stack header.
function CustomHeader({ title, onBack, colors, insetsTop }: CustomHeaderProps) {
  return (
    <View
      style={[
        styles.headerRow,
        {
          paddingTop: (Platform.OS === 'android' ? insetsTop : 0) + 6,
          backgroundColor: colors.background,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [
          styles.headerBackPill,
          { backgroundColor: colors.surfaceGlass, opacity: pressed ? 0.8 : 1 },
          SHADOWS.sm,
        ]}
      >
        <BackIcon color={colors.text} />
        <Text style={[styles.headerBackText, { color: colors.text }]}>Back</Text>
      </Pressable>
      <View style={styles.headerTitleWrap} pointerEvents="none">
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="middle">
          {title}
        </Text>
      </View>
    </View>
  );
}

export default function PdfViewerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ cdnUrl?: string; name?: string }>();

  const cdnUrl = params.cdnUrl || (__DEV__ ? SAMPLE_PDF_URL : undefined);
  const displayName = params.name || (__DEV__ ? SAMPLE_PDF_NAME : 'Document');
  const cacheFilename = sanitizeCacheFilename(displayName);

  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Download-first pattern (RESEARCH Pattern 4 — the New-Architecture
  // mitigation): never hand <Pdf> a remote https:// url or { uri, cache: true }
  // (RESEARCH Pitfall 2). Always resolve to a local file:// uri first.
  useEffect(() => {
    let cancelled = false;
    setLocalUri(null);
    setError(false);

    if (!cdnUrl) {
      setError(true);
      return;
    }

    (async () => {
      try {
        const dest = FileSystem.cacheDirectory + cacheFilename;
        const { uri } = await FileSystem.downloadAsync(cdnUrl, dest);
        if (!cancelled) setLocalUri(uri);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cdnUrl, cacheFilename, attempt]);

  const handleRetry = useCallback(() => setAttempt((n) => n + 1), []);
  const handleBack = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/(app)/chat')),
    [router],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <CustomHeader title={displayName} onBack={handleBack} colors={colors} insetsTop={insets.top} />

      {error ? (
        <View style={styles.centerState}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Couldn&apos;t open this document</Text>
          <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            onPress={handleRetry}
            style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : !localUri ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={[styles.openingText, { color: colors.textMuted }]}>Opening…</Text>
        </View>
      ) : (
        <Pdf
          source={{ uri: localUri }}
          style={styles.pdf}
          onError={() => setError(true)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1, width: '100%' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.page,
    paddingBottom: 10,
  },
  headerBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    zIndex: 1,
  },
  headerBackText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Reserve clearance on both sides so a long filename stays visually centered
    // without sliding under the "< Back" pill (pill right edge ≈ SPACING.page(20)
    // + pill width ≈ 78 ≈ 98px; 112 leaves a comfortable gap).
    paddingHorizontal: 112,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: SPACING.xl,
  },
  openingText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
});
