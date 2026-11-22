import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

// ── Invite clipboard claim (261122-evw, reworked 261122-hdy) ────────────────
// The /invite, /g/:slug and /u/:handle interstitial pages leave an attribution
// payload on the clipboard before the App Store redirect. Reading the clipboard
// text shows the iOS "Allow Paste" alert, so it must NEVER happen at launch or
// in an effect: only from the Continue tap of our own explainer card on the
// onboarding registration step (claimInviteFromClipboard). Whether to show the
// card is decided prompt-free (shouldOfferInviteClipboardClaim, metadata only).
//
// `clipboardRefChecked` is the once-per-install flag. It is shared with the
// legacy launch-time auto-read, so installs that already had their clipboard
// checked by that era stay blocked (intended).
//
// Supported payload formats:
//  - `tribelife-ref:<handle>`              -> source = 'handle_code'
//  - `tribelife-g-ref:<handle>:<slug>`     -> source = 'group_invite'
//  - `tribelife-u-ref:<handle>:<handle>`   -> source = 'profile_share'

export type InviteAttributionSource = 'handle_code' | 'profile_share' | 'group_invite';

export type InviteClaimResult =
  | {
      matched: true;
      ref: string;
      source: InviteAttributionSource;
      pendingGroupSlug: string | null;
      pendingProfileHandle: string | null;
    }
  | { matched: false };

/**
 * Prompt-free (metadata only): true when a claim should be offered, i.e. no
 * attribution is stored, the once-per-install flag is unset, and the clipboard
 * reports a string. Never reads clipboard content.
 */
export async function shouldOfferInviteClipboardClaim(): Promise<boolean> {
  try {
    const storedRef = await AsyncStorage.getItem('attributionRef');
    const alreadyChecked = await AsyncStorage.getItem('clipboardRefChecked');
    if (storedRef || alreadyChecked) return false;
    return await Clipboard.hasStringAsync();
  } catch {
    return false;
  }
}

/**
 * Parse an invite payload (from a clipboard read) and
 * persist the attribution. Sets the once-per-install flag first, clears the
 * clipboard only on a match (writing does not prompt). Never throws.
 */
export async function parseAndStoreInvite(content: string): Promise<InviteClaimResult> {
  try {
    await AsyncStorage.setItem('clipboardRefChecked', '1');

    // Trim: copied/pasted text often carries a trailing newline or spaces, which
    // the anchored patterns below would otherwise reject.
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return { matched: false };

    // Match in order — first hit wins. The two-segment patterns (g-ref / u-ref)
    // are matched BEFORE the single-segment fallback so a payload like
    // `tribelife-g-ref:alice:my-group` is not misclassified.
    const matchG = text.match(/^tribelife-g-ref:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/);
    const matchU = text.match(/^tribelife-u-ref:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/);
    const match = text.match(/^tribelife-ref:([a-zA-Z0-9_-]+)$/);

    let ref: string | null = null;
    let source: InviteAttributionSource | null = null;
    // Deferred deep link target — the slug or handle the interstitial captured.
    // Persisted alongside the attribution so sign-in / onboarding can route the
    // user to the join screen after a fresh App Store install.
    let pendingGroupSlug: string | null = null;
    let pendingProfileHandle: string | null = null;
    if (matchG) {
      ref = matchG[1].toLowerCase();
      source = 'group_invite';
      pendingGroupSlug = matchG[2];
    } else if (matchU) {
      ref = matchU[1].toLowerCase();
      source = 'profile_share';
      pendingProfileHandle = matchU[2];
    } else if (match) {
      ref = match[1].toLowerCase();
      source = 'handle_code';
    }

    // No match: leave the user's unrelated clipboard text untouched.
    if (!ref || !source) return { matched: false };

    await AsyncStorage.setItem('attributionRef', ref);
    await AsyncStorage.setItem('attributionSource', source);
    if (pendingGroupSlug) {
      await AsyncStorage.setItem('pendingGroupSlug', pendingGroupSlug);
    }
    if (pendingProfileHandle) {
      await AsyncStorage.setItem('pendingProfileHandle', pendingProfileHandle);
    }

    // Clear the clipboard so the user doesn't accidentally paste it elsewhere.
    // Own try/catch: a failed clear must not turn a stored match into "no invite".
    try {
      await Clipboard.setStringAsync('');
    } catch { /* ignore clipboard clear errors */ }

    return { matched: true, ref, source, pendingGroupSlug, pendingProfileHandle };
  } catch {
    return { matched: false };
  }
}

/**
 * Record that the clipboard check is done (explainer shown and skipped) without
 * reading the clipboard.
 */
export async function markInviteClipboardChecked(): Promise<void> {
  try {
    await AsyncStorage.setItem('clipboardRefChecked', '1');
  } catch { /* ignore storage errors */ }
}

/**
 * Read the clipboard text and claim the invite. Must only ever be called from
 * the Continue tap of the explainer card: on iOS 16+ the clipboard text read
 * shows the system "Allow Paste" alert (Don't Allow rejects -> no match).
 */
export async function claimInviteFromClipboard(): Promise<InviteClaimResult> {
  try {
    await AsyncStorage.setItem('clipboardRefChecked', '1');
    const content = await Clipboard.getStringAsync();
    return await parseAndStoreInvite(content);
  } catch {
    return { matched: false };
  }
}
