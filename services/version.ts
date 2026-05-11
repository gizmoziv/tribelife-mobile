import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL } from '@/constants';

/**
 * Phase 6 force-update gate — mobile service (FORCE-02).
 *
 * Calls GET /api/version/check on the backend (06-01) with the device's
 * binary version and platform. Returns a discriminated union the app
 * shell branches on:
 *
 *   { status: 'ok' }           proceed with normal boot
 *   { status: 'force_update', minVersion, message? }
 *                              render ForceUpdateModal, gate the Stack
 *   { status: 'unreachable' }  treat as 'ok' per D-02 fail-open — the app's
 *                              own error handling takes over downstream
 *
 * Per D-05 dev builds bypass the network call entirely (no roundtrip,
 * resolves to 'ok' immediately).
 *
 * Per D-02 production builds retry exactly ONCE after 1s on network/5xx;
 * if both attempts fail, returns 'unreachable' (the caller treats this
 * as 'ok' — the rest of the app can't work offline either).
 *
 * This service deliberately does NOT use services/api.ts request<T>()
 * because that helper attaches the bearer token and adds 401 retry/refresh
 * logic. The version endpoint is fully public (Phase 6 D-10) and runs
 * BEFORE token restore on cold start.
 */

export type VersionCheckResult =
  | { status: 'ok' }
  | { status: 'force_update'; minVersion: string; message?: string }
  | { status: 'unreachable' };

// Per D-04: app.json `version` is the source of truth (binary version,
// not JS bundle). Fall back to '0.0.0' if missing — server treats that as
// below any real floor; but combined with D-06 server-side fail-open on
// unparseable input, this still produces ok:true when env floor is 0.0.0.
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const PLATFORM: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 1_000;

/**
 * Single attempt — resolves to the parsed result, or throws on any
 * network/parse/non-2xx condition. Wrapped by the public checkVersion().
 */
async function attemptCheck(): Promise<VersionCheckResult> {
  const url = `${API_URL}/api/version/check?platform=${encodeURIComponent(PLATFORM)}&version=${encodeURIComponent(APP_VERSION)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) throw new Error(`[version] non-2xx: ${res.status}`);
    const body = await res.json();
    if (body?.ok === true) return { status: 'ok' };
    if (
      body?.ok === false &&
      body?.reason === 'force_update' &&
      typeof body?.minVersion === 'string'
    ) {
      const result: VersionCheckResult = {
        status: 'force_update',
        minVersion: body.minVersion,
      };
      if (typeof body.message === 'string' && body.message.length > 0) {
        (
          result as {
            status: 'force_update';
            minVersion: string;
            message?: string;
          }
        ).message = body.message;
      }
      return result;
    }
    // Unknown shape → fail-open (treat as ok). Server contract is the source
    // of truth; a future server-side reason (e.g. 'maintenance') we don't
    // recognize yet must NOT lock the user out.
    return { status: 'ok' };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkVersion(): Promise<VersionCheckResult> {
  // D-05 — dev builds bypass the network entirely.
  if (__DEV__) return { status: 'ok' };

  try {
    return await attemptCheck();
  } catch (err1) {
    // D-02 — exactly one retry after 1s.
    console.warn('[version] check failed, retrying in 1s', err1);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      return await attemptCheck();
    } catch (err2) {
      console.warn(
        '[version] check failed twice, falling back to unreachable',
        err2,
      );
      return { status: 'unreachable' };
    }
  }
}
