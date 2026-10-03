// Long-message splitter + ordered chunk sender (quick 261002-w9b).
//
// Pure module: ZERO imports so scripts/verify-split-message.mjs can load it directly
// under Node's type stripping. Only erasable TypeScript syntax (no enums/namespaces).
// Avoids Unicode property escapes and Intl segmentation: Hermes support is uncertain,
// so grapheme safety is done with explicit UTF-16 code-unit range checks.

// Per-message cap. MUST equal MESSAGE_MAX_LENGTH in tribelife-backend/src/lib/messageSend.ts.
// Measured in UTF-16 code units (String.prototype.length), exactly like the server's check.
export const MESSAGE_MAX_LENGTH = 4000;

// Max characters accepted per send (spam guard). Enforced at send time with an alert,
// never by truncating the text box.
export const MESSAGE_INPUT_MAX_LENGTH = 5 * MESSAGE_MAX_LENGTH;

// Paces split parts under the globe 1 msg/sec token bucket in
// tribelife-backend/src/socket/rateLimit.ts.
export const GLOBE_CHUNK_GAP_MS = 1050;

export type ChunkSendAck = { ok: true; id?: number } | { ok: false; reason?: string; retryAfterMs?: number };

const MIN_CAP = 16;

// ── Character classes (UTF-16 code units) ───────────────────────────────────

const WS_RE = /\s/;

/** Breakable whitespace: any `\s` char except the non-breaking spaces. */
function isBreakableWs(ch: string): boolean {
  if (ch === ' ' || ch === ' ' || ch === ' ' || ch === '﻿') return false;
  return WS_RE.test(ch);
}

function isSentenceEnd(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === '。' || ch === '！' || ch === '？';
}

function isHighSurrogate(u: number): boolean {
  return u >= 0xd800 && u <= 0xdbff;
}

function isLowSurrogate(u: number): boolean {
  return u >= 0xdc00 && u <= 0xdfff;
}

function isCombiningUnit(u: number): boolean {
  return (
    (u >= 0x0300 && u <= 0x036f) ||
    (u >= 0x0483 && u <= 0x0489) ||
    (u >= 0x0591 && u <= 0x05bd) ||
    u === 0x05bf ||
    (u >= 0x05c1 && u <= 0x05c2) ||
    (u >= 0x05c4 && u <= 0x05c5) ||
    u === 0x05c7 ||
    (u >= 0x0610 && u <= 0x061a) ||
    (u >= 0x064b && u <= 0x065f) ||
    u === 0x0670 ||
    (u >= 0x1ab0 && u <= 0x1aff) ||
    (u >= 0x1dc0 && u <= 0x1dff) ||
    (u >= 0x20d0 && u <= 0x20ff) ||
    (u >= 0xfe00 && u <= 0xfe0f) ||
    (u >= 0xfe20 && u <= 0xfe2f)
  );
}

/** Number of consecutive regional-indicator symbols (2 code units each) ending just before `end`. */
function regionalIndicatorsBefore(s: string, end: number): number {
  let count = 0;
  let j = end;
  while (j >= 2 && s.charCodeAt(j - 2) === 0xd83c) {
    const lo = s.charCodeAt(j - 1);
    if (lo < 0xdde6 || lo > 0xddff) break;
    count++;
    j -= 2;
  }
  return count;
}

/** True when cutting between s[c - 1] and s[c] would break a surrogate pair or a grapheme cluster. */
function isUnsafeCut(s: string, c: number): boolean {
  if (c <= 0 || c >= s.length) return false;
  const a = s.charCodeAt(c - 1);
  const b = s.charCodeAt(c);
  if (isHighSurrogate(a) && isLowSurrogate(b)) return true;
  if (a === 0x200d || b === 0x200d) return true;
  if (isCombiningUnit(b)) return true;
  const b2 = c + 1 < s.length ? s.charCodeAt(c + 1) : -1;
  if (b === 0xd83c && b2 >= 0xdffb && b2 <= 0xdfff) return true; // skin-tone modifier
  if (b === 0xdb40 && b2 >= 0xdc20 && b2 <= 0xdc7f) return true; // tag character
  if (b === 0xd83c && b2 >= 0xdde6 && b2 <= 0xddff && regionalIndicatorsBefore(s, c) % 2 === 1) return true; // flag pair
  return false;
}

// ── Cut selection ───────────────────────────────────────────────────────────

function findParagraphBreak(rest: string, lo: number, hi: number): number {
  for (let p = hi; p >= lo; p--) {
    if (rest[p] !== '\n') continue;
    let q = p + 1;
    while (q < rest.length && (rest[q] === ' ' || rest[q] === '\t' || rest[q] === '\r')) q++;
    if (rest[q] === '\n') return p;
  }
  return -1;
}

function findCut(rest: string, cap: number): number {
  const lo = Math.floor(cap / 2);
  // 1. Paragraph break
  const para = findParagraphBreak(rest, lo, cap);
  if (para >= 0) return para;
  // 2. Any newline
  for (let p = cap; p >= lo; p--) {
    if (rest[p] === '\n') return p;
  }
  // 3. Sentence end followed by breakable whitespace
  for (let p = cap; p >= lo; p--) {
    if (isBreakableWs(rest[p]) && isSentenceEnd(rest[p - 1])) return p;
  }
  // 4. Any breakable whitespace in the window
  for (let p = cap; p >= lo; p--) {
    if (isBreakableWs(rest[p])) return p;
  }
  // 5. Last breakable whitespace before the window
  for (let p = lo - 1; p >= 1; p--) {
    if (isBreakableWs(rest[p])) return p;
  }
  // 6. Hard split: one token longer than the cap
  for (let c = cap; c >= 1; c--) {
    if (!isUnsafeCut(rest, c)) return c;
  }
  return isHighSurrogate(rest.charCodeAt(cap - 1)) ? cap - 1 : cap;
}

/**
 * Split `text` into parts of at most `cap` UTF-16 code units, preferring paragraph,
 * then line, then sentence, then word boundaries. Never cuts a whitespace-delimited
 * token (word, URL, @mention) unless that single token is longer than `cap`; a hard
 * split never breaks a surrogate pair, ZWJ sequence, combining mark or flag.
 */
export function splitMessage(text: string, cap: number = MESSAGE_MAX_LENGTH): string[] {
  if (!Number.isInteger(cap) || cap < MIN_CAP) {
    throw new RangeError('splitMessage cap must be an integer >= ' + MIN_CAP);
  }
  const t = text.trim();
  if (t.length === 0) return [];
  if (t.length <= cap) return [t];

  const parts: string[] = [];
  let rest = t;
  while (rest.length > cap) {
    const c = findCut(rest, cap);
    parts.push(rest.slice(0, c).trimEnd());
    rest = rest.slice(c).trimStart();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/**
 * The exact original text that was not sent: walk the trimmed text past the first
 * `fromIndex` chunks. Falls back to joining the remaining chunks if a chunk can't be found.
 */
export function unsentRemainder(text: string, chunks: string[], fromIndex: number): string {
  const t = text.trim();
  let pos = 0;
  for (let i = 0; i < fromIndex && i < chunks.length; i++) {
    const at = t.indexOf(chunks[i], pos);
    if (at < 0) return chunks.slice(fromIndex).join('\n\n');
    pos = at + chunks[i].length;
  }
  return t.slice(pos).trimStart();
}

/**
 * Send chunks strictly one after another: chunk i+1 is never emitted before chunk i's
 * promise has resolved. A `rate_limited` refusal is retried (same chunk) after the
 * server's hint; any other failure stops the run.
 */
export async function sendChunksInOrder(
  chunks: string[],
  emitChunk: (chunk: string, index: number) => Promise<ChunkSendAck>,
  options?: { minGapMs?: number; maxRateLimitRetries?: number; sleep?: (ms: number) => Promise<void> },
): Promise<{ sentCount: number; failedIndex: number | null; reason: string | null }> {
  const minGapMs = options?.minGapMs ?? 0;
  const maxRetries = options?.maxRateLimitRetries ?? 3;
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let sentCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0 && minGapMs > 0) await sleep(minGapMs);
    let retries = 0;
    for (;;) {
      let ack: ChunkSendAck;
      try {
        ack = await emitChunk(chunks[i], i);
      } catch {
        ack = { ok: false, reason: 'error' };
      }
      if (ack.ok) {
        sentCount++;
        break;
      }
      if (ack.reason === 'rate_limited' && retries < maxRetries) {
        retries++;
        await sleep(Math.max(ack.retryAfterMs ?? 1000, 1000) + 100);
        continue;
      }
      return { sentCount, failedIndex: i, reason: ack.reason ?? null };
    }
  }
  return { sentCount: chunks.length, failedIndex: null, reason: null };
}

const SNAKE_CASE_CODE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** User-facing text for a send failure reason (client code, server code, or server-written text). */
export function friendlySendFailure(reason: string | null | undefined): string {
  if (!reason || reason === 'timeout' || reason === 'offline' || reason === 'error') {
    return 'Connection problem. Check your connection and try again.';
  }
  if (reason === 'rate_limited') return 'You are sending messages too fast. Wait a moment and try again.';
  if (reason === 'age_gated') return "New accounts can't post in this room yet.";
  if (SNAKE_CASE_CODE_RE.test(reason)) return 'Your message could not be sent.';
  return reason;
}
