// YouTube link parsing + oEmbed metadata helpers for chat unfurl cards.
//
// Pure-TS module (no JSX), matching the utils/ convention. Detection is done
// entirely client-side by parsing message text — no API key, no backend call.
// Thumbnails are derived from the video ID; title + channel come from YouTube's
// free, keyless oEmbed endpoint and are cached in-memory per video ID.

// ── Constants ───────────────────────────────────────────────────────────────

// Max distinct YouTube cards to render per message (abuse guard, see PLAN spec).
const MAX_IDS = 3;

// Tolerant matcher for every YouTube URL form we care about:
//   - youtu.be/<id>
//   - youtube.com/watch?v=<id>   (with extra params: &t=30s, &list=…)
//   - youtube.com/shorts/<id>
//   - youtube.com/embed/<id>, youtube.com/v/<id>
//   - m.youtube.com and www. prefixed variants
//   - http / https / protocol-less forms
// The 11-char video ID is [A-Za-z0-9_-]{11}. We anchor the ID to a host/path
// shape so arbitrary 11-char strings in prose are not misread as IDs.
const YOUTUBE_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract an ordered list of DISTINCT 11-char YouTube video IDs from text.
 * De-dupes while preserving first-seen order; caps the result at MAX_IDS (3).
 * Returns [] when no YouTube links are present.
 */
export function extractYouTubeIds(text: string): string[] {
  if (!text) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  YOUTUBE_URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = YOUTUBE_URL_REGEX.exec(text)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_IDS) break;
    }
  }
  return ids;
}

/**
 * Thumbnail URL derived directly from the video ID (always exists, no call).
 * 'hq' → hqdefault.jpg (default), 'mq' → mqdefault.jpg (load-error fallback).
 */
export function getThumbnailUrl(id: string, quality: 'hq' | 'mq' = 'hq'): string {
  const file = quality === 'mq' ? 'mqdefault' : 'hqdefault';
  return `https://img.youtube.com/vi/${id}/${file}.jpg`;
}

/**
 * Canonical watch URL — used for the oEmbed request and as the player source.
 */
export function getWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

// ── oEmbed metadata (title + channel), cached per video ID ───────────────────

const oembedCache = new Map<string, { title: string; channel: string }>();

/**
 * Fetch a video's title + channel from YouTube's keyless oEmbed endpoint.
 * Returns the cached value immediately on a cache hit. Returns null gracefully
 * on any non-OK response or parse error (never throws). Failures are NOT cached,
 * so a later call can retry and succeed.
 */
export async function fetchYouTubeOEmbed(
  id: string,
): Promise<{ title: string; channel: string } | null> {
  const cached = oembedCache.get(id);
  if (cached) return cached;
  try {
    const url =
      'https://www.youtube.com/oembed?url=' +
      encodeURIComponent(getWatchUrl(id)) +
      '&format=json';
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (typeof data.title !== 'string') return null;
    const meta = { title: data.title, channel: data.author_name ?? '' };
    oembedCache.set(id, meta);
    return meta;
  } catch {
    return null;
  }
}
