// ── Document (PDF) attachment constants + helpers ────────────────────────────
// A PDF message normally carries the user's typed caption as `content`. When the
// sender typed nothing, the backend stores a server-generated fallback line so
// pre-Phase-31 clients render a readable bubble. The new client detects that
// fallback and suppresses it (the DocumentCard already tells the story), while a
// real caption is rendered under the card (quick 261002-vk5 D-1).
//
// MUST stay in sync with the backend `DOC_FALLBACK` template in
// tribelife-backend/src/socket/{dmHandler,roomHandler,globeHandler}.ts.

/**
 * Anchored pattern for the backend fallback line. The handle segment is `\S+`
 * (not the mention charset) on purpose: the fallback embeds the sender's handle
 * as it was at send time, and that handle may have been renamed since.
 */
export const DOC_FALLBACK_PATTERN = /^📄 @\S+ sent a PDF — update the app to view it\.$/u;

/** True when `text` is exactly the server-generated PDF fallback line. */
export function isDocFallbackContent(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  return DOC_FALLBACK_PATTERN.test(text.trim());
}
