import { AppState } from 'react-native';

// ── Temporary navigation tracing ─────────────────────────────────────────
// Added for the "iOS cold-start notification tap lands on Beacon" debug
// session (.planning/debug/ios-cold-tap-lands-on-beacon.md). Every line is
// tagged `[nav-trace]` so a captured device log can be filtered with one
// grep. Flip NAV_TRACE to false (or delete this file and its navTrace()
// call sites) once the diagnosis is confirmed on device.
//
// Never pass message content / tokens in `detail` — ids, types and counters
// only.
const NAV_TRACE = true;

export function navTrace(event: string, detail?: Record<string, unknown>): void {
  if (!NAV_TRACE) return;
  const stamp = new Date().toISOString();
  const suffix = detail ? ` ${JSON.stringify(detail)}` : '';
  console.log(`[nav-trace] ${stamp} appState=${AppState.currentState} ${event}${suffix}`);
}
