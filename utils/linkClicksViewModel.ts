// View-model for the Info sheet's "Link clicks" section, plus the tap-tracking
// rule (quick 261003-nfu).
//
// The single source of every string the section shows. It is pure (zero
// imports, no React Native) so scripts/verify-link-clicks.mjs can run it in
// Node. The visible stat labels ('Clicks', 'Unique people') stay fixed per the
// approved mockup; singular and plural forms apply only in the screen-reader
// sentence (PD-12).

// ── Copy ─────────────────────────────────────────────────────────────────────

export const LINK_CLICKS_HEADER = 'LINK CLICKS';
export const LINK_CLICKS_LABEL_MAX = 40;
export const LINK_CLICKS_LOCKED_TITLE = 'Link clicks';
export const LINK_CLICKS_LOCKED_BODY = 'Upgrade to Premium to see how many people opened your links';
export const LINK_CLICKS_UPSELL_BODY = 'Link click analytics are a Premium feature. Upgrade to see how many people opened your links.';
export const LINK_CLICKS_EMPTY = 'No link clicks yet';
export const LINK_CLICKS_ERROR = "Couldn't load link clicks";
export const LINK_CLICKS_RETRY = 'Try again';
export const LINK_CLICKS_LOADING_A11Y = 'Loading link clicks';

// ── Types ────────────────────────────────────────────────────────────────────

export type LinkClickStatInput = { url: string; clicks: number; uniqueClickers: number };

export type LinkClicksInput = {
  linkCount: number;
  canView: boolean;
  loading: boolean;
  error: boolean;
  stats: LinkClickStatInput[] | null;
};

export type LinkClickRowVm = {
  key: string;
  icon: 'link' | 'youtube';
  label: string;
  clicks: number;
  unique: number;
  clicksText: string;
  uniqueText: string;
  a11yLabel: string;
};

export type LinkClicksVm =
  | { kind: 'hidden' }
  | { kind: 'locked'; title: string; body: string; a11yLabel: string }
  | { kind: 'loading'; header: string; a11yLabel: string }
  | { kind: 'error'; header: string; message: string; retryLabel: string }
  | { kind: 'empty'; header: string; message: string }
  | { kind: 'rows'; header: string; rows: LinkClickRowVm[] };

// ── Helpers ──────────────────────────────────────────────────────────────────

// A normalized link key that points at YouTube (strict host match).
export function isYouTubeLinkKey(url: string): boolean {
  return /^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com|youtu\.be)(?:[/?#]|$)/i.test(url);
}

// host + path, without scheme, www, query or fragment, cut to `max` characters
// with an ellipsis.
export function shortenLinkLabel(url: string, max: number = LINK_CLICKS_LABEL_MAX): string {
  const trimmed = url.trim();
  let label = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const cut = label.search(/[?#]/);
  if (cut >= 0) label = label.slice(0, cut);
  label = label.replace(/\/+$/, '');
  if (!label) return trimmed;
  const chars = Array.from(label);
  if (chars.length <= max) return label;
  return chars.slice(0, max - 1).join('').replace(/[/.\-_]+$/, '') + '…';
}

// Should a tap on a link report a click? Only when tracking is enabled for this
// bubble, the viewer is not the sender, the message has a real server id
// (optimistic ids are not positive integers) and it is not a system message.
export function shouldTrackLinkClick(input: {
  enabled: boolean;
  isMe: boolean;
  messageId: number;
  kind?: string | null;
}): boolean {
  return (
    input.enabled &&
    !input.isMe &&
    Number.isInteger(input.messageId) &&
    input.messageId > 0 &&
    input.kind !== 'system'
  );
}

function cleanCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function youTubeVideoId(url: string): string | null {
  const m = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/v\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ── View-model ───────────────────────────────────────────────────────────────

export function buildLinkClicksViewModel(input: LinkClicksInput): LinkClicksVm {
  if (input.linkCount <= 0) return { kind: 'hidden' };

  if (!input.canView) {
    return {
      kind: 'locked',
      title: LINK_CLICKS_LOCKED_TITLE,
      body: LINK_CLICKS_LOCKED_BODY,
      a11yLabel: `${LINK_CLICKS_LOCKED_TITLE}. ${LINK_CLICKS_LOCKED_BODY}`,
    };
  }

  // Data wins over the loading and error flags, so a refresh never blanks rows.
  if (input.stats) {
    const stats = input.stats.filter((s) => s.url !== '');
    if (stats.length === 0) return { kind: 'hidden' };
    const cleaned = stats.map((s) => ({
      url: s.url,
      clicks: cleanCount(s.clicks),
      unique: cleanCount(s.uniqueClickers),
    }));
    if (cleaned.every((s) => s.clicks === 0)) {
      return { kind: 'empty', header: LINK_CLICKS_HEADER, message: LINK_CLICKS_EMPTY };
    }
    const rows: LinkClickRowVm[] = cleaned.map((s, i) => {
      const isYouTube = isYouTubeLinkKey(s.url);
      const videoId = isYouTube ? youTubeVideoId(s.url) : null;
      const label = videoId ? `youtu.be/${videoId}` : shortenLinkLabel(s.url);
      const kindLabel = isYouTube ? 'YouTube video' : 'Link';
      return {
        key: `${i}:${s.url}`,
        icon: isYouTube ? 'youtube' : 'link',
        label,
        clicks: s.clicks,
        unique: s.unique,
        clicksText: String(s.clicks),
        uniqueText: String(s.unique),
        a11yLabel: `${kindLabel} ${label}, ${s.clicks} ${plural(s.clicks, 'click', 'clicks')}, ${s.unique} unique ${plural(s.unique, 'person', 'people')}`,
      };
    });
    return { kind: 'rows', header: LINK_CLICKS_HEADER, rows };
  }

  if (input.error && !input.loading) {
    return {
      kind: 'error',
      header: LINK_CLICKS_HEADER,
      message: LINK_CLICKS_ERROR,
      retryLabel: LINK_CLICKS_RETRY,
    };
  }

  // Includes the first render before the fetch starts, so the section never
  // flashes empty.
  return { kind: 'loading', header: LINK_CLICKS_HEADER, a11yLabel: LINK_CLICKS_LOADING_A11Y };
}
