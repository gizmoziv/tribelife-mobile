// Group Info "Leave group" dialog copy and the post-leave notice (quick 261003-vpp).
//
// When the last admin leaves, the server hands admin to the longest-standing
// ACTIVE member (joined earliest, not banned) and archives the group only when
// nobody can take over. The screen cannot see bans or concurrent changes, so the
// copy describes the rule and never names a person, and the server's `archived`
// flag decides whether a notice is needed.
//
// This file has ZERO imports so scripts/verify-group-leave.mjs can test it in
// plain Node.

export const LEAVE_PLAIN_TITLE = 'Leave Group';
export const LEAVE_PLAIN_MESSAGE =
  'Are you sure you want to leave this group? You can rejoin with an invite link.';
export const LEAVE_CONFIRM = 'Leave';
export const LEAVE_HANDOFF_MESSAGE =
  "You're the last admin. When you leave, the longest-standing active member will become the group's admin.";
export const LEAVE_ARCHIVE_TITLE = 'Archive this group?';
export const LEAVE_ARCHIVE_MESSAGE =
  "You're the last admin. If you leave, this group will be archived — no one will be able to send new messages.";
export const LEAVE_ARCHIVE_CONFIRM = 'Leave & Archive';
export const LEAVE_ARCHIVED_NOTICE_TITLE = 'Group archived';
export const LEAVE_ARCHIVED_NOTICE_MESSAGE =
  'No other member could take over as admin, so the group was archived.';

export type LeaveDialogVariant = 'plain' | 'handoff' | 'archive';

export type LeaveMember = { userId: number; role: string | null | undefined };

export type LeaveDialogCopy = { title: string; message: string; confirmLabel: string };

export type LeaveOutcomeNotice = { title: string; message: string };

/**
 * Which dialog to show. Only the last admin gets a non-plain variant: 'handoff'
 * when anyone else is in the (active) members list, 'archive' when they are alone.
 */
export function leaveDialogVariant(
  members: readonly LeaveMember[] | null | undefined,
  myUserId: number | null | undefined,
): LeaveDialogVariant {
  if (!members || myUserId == null) return 'plain';
  const me = members.find((m) => m.userId === myUserId);
  if (!me || me.role !== 'admin') return 'plain';
  const others = members.filter((m) => m.userId !== myUserId && m.role !== 'kicked');
  if (others.some((m) => m.role === 'admin')) return 'plain';
  return others.length > 0 ? 'handoff' : 'archive';
}

export function leaveDialogCopy(variant: LeaveDialogVariant): LeaveDialogCopy {
  if (variant === 'archive') {
    return {
      title: LEAVE_ARCHIVE_TITLE,
      message: LEAVE_ARCHIVE_MESSAGE,
      confirmLabel: LEAVE_ARCHIVE_CONFIRM,
    };
  }
  if (variant === 'handoff') {
    return {
      title: LEAVE_PLAIN_TITLE,
      message: LEAVE_HANDOFF_MESSAGE,
      confirmLabel: LEAVE_CONFIRM,
    };
  }
  return {
    title: LEAVE_PLAIN_TITLE,
    message: LEAVE_PLAIN_MESSAGE,
    confirmLabel: LEAVE_CONFIRM,
  };
}

/**
 * A notice only for an archive the dialog did not promise (every other member
 * banned, a concurrent change, or an older backend). Strict `=== true`.
 */
export function leaveOutcomeNotice(
  variant: LeaveDialogVariant,
  archived: unknown,
): LeaveOutcomeNotice | null {
  if (archived === true && variant !== 'archive') {
    return { title: LEAVE_ARCHIVED_NOTICE_TITLE, message: LEAVE_ARCHIVED_NOTICE_MESSAGE };
  }
  return null;
}
