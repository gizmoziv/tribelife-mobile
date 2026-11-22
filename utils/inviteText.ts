// Pure invite helpers for the Invite Contacts screen (Phase 48).
// ZERO imports and no React Native: scripts/verify-invite.mjs runs this file in Node.

/** Attribution link, identical to Profile's handleShare link for real handles. */
export function inviteLink(handle: string): string {
  return `https://tribelife.app/u/${encodeURIComponent(handle)}?ref=${encodeURIComponent(handle)}`;
}

/** Personal invite text; "Hey!" when there is no first name. */
export function personalInvite(first: string, link: string): string {
  const greeting = first ? `Hey ${first}!` : 'Hey!';
  return `${greeting} I'm on TribeLife — a global Jewish community app. Join me: ${link}`;
}

/** Generic invite text (no first name) for share buttons. */
export function genericInvite(link: string): string {
  return personalInvite('', link);
}

export function firstNameOf(givenName?: string | null, fullName?: string | null): string {
  const given = (givenName ?? '').trim();
  if (given) return given;
  const full = (fullName ?? '').trim();
  if (!full) return '';
  return full.split(/\s+/)[0] ?? '';
}

export function displayNameOf(
  fullName: string | null | undefined,
  givenName: string | null | undefined,
  familyName: string | null | undefined,
  fallback: string,
): string {
  const full = (fullName ?? '').trim();
  if (full) return full;
  const joined = [(givenName ?? '').trim(), (familyName ?? '').trim()].filter(Boolean).join(' ');
  if (joined) return joined;
  return fallback;
}

/**
 * Distinct raw phone numbers (deduped by digits), `mobile` first, then `iPhone`,
 * then the rest in source order.
 */
export function pickPhones(
  phones: { label?: string | null; number?: string | null }[],
): string[] {
  const seen = new Set<string>();
  const unique: { label: string; number: string }[] = [];
  for (const p of phones) {
    const number = (p.number ?? '').trim();
    if (!number) continue;
    const key = number.replace(/\D/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ label: p.label ?? '', number });
  }
  const rank = (label: string): number => {
    if (label === 'mobile') return 0;
    if (label === 'iPhone') return 1;
    return 2;
  };
  return unique
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry.label) - rank(b.entry.label) || a.index - b.index)
    .map((x) => x.entry.number);
}

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  if (!first) return '#';
  return first.toUpperCase();
}

export function sectionKeyOf(name: string): string {
  const first = Array.from(name.trim())[0];
  if (!first) return '#';
  if (/\p{L}/u.test(first)) return first.toUpperCase();
  return '#';
}

// Hebrew/Arabic RTL detection (same regex as components/ui/chat/VoicePlayerBubble.tsx).
export function isRTLText(text: string): boolean {
  return /[֐-׿؀-ۿ]/.test(text);
}

export function invitedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `✓ Invited · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Click-to-chat link; without digits it opens WhatsApp's generic share (user picks the chat). */
export function whatsAppUrl(digits: string | null, text: string): string {
  const encoded = encodeURIComponent(text);
  if (digits) return `https://wa.me/${digits}?text=${encoded}`;
  return `https://wa.me/?text=${encoded}`;
}

/** LinkedIn share link; LinkedIn reads only `url`, the card preview comes from the page's OG tags. */
export function linkedInShareUrl(link: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
}

/**
 * Checklist search: case-insensitive name substring; a query with 2+ digits also
 * matches any phone's digits (one digit alone matches names only).
 */
export function matchesQuery(name: string, phones: string[], query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  if (name.toLocaleLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length < 2) return false;
  return phones.some((phone) => phone.replace(/\D/g, '').includes(digits));
}

/** Footer for contacts left out because they have no phone number. */
export function hiddenNote(n: number): string {
  if (n <= 0) return '';
  if (n === 1) return "1 contact without a phone number isn't shown";
  return `${n} contacts without a phone number aren't shown`;
}

/** JSON object of contactId -> ISO date; anything else is treated as empty. */
export function parseInvitedMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** JSON array of contact ids; non-string entries are dropped. */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}
