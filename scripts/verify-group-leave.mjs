// verify-group-leave.mjs
//
// OFFLINE ONLY — never imported by app code. Exercises the pure Leave-group
// confirmation rules in utils/groupLeaveCopy.ts (Group Info → Leave Group).
// No React Native, no network, no database: the module has zero imports.
//
// What it proves (quick 261003-vpp):
//   - A plain member, an admin with another admin present, or a screen whose
//     members list has not loaded gets the existing plain Leave dialog.
//   - The LAST admin with at least one other member gets the handoff wording
//     (the longest-standing active member becomes admin) and a plain 'Leave'
//     button. The copy never names a person: the screen cannot see bans or
//     concurrent changes, so it describes the server rule instead.
//   - The last admin with nobody else left keeps the archive wording and the
//     'Leave & Archive' button.
//   - The server's `archived` flag is honored: an archive the dialog did not
//     promise (all other members banned, a concurrent leave, or an older
//     backend) produces a 'Group archived' notice; otherwise no notice.
//
// Usage (from tribelife-mobile/): node --no-warnings scripts/verify-group-leave.mjs
//   Optional arg: [path/to/groupLeaveCopy.ts], resolved against the current
//   working directory. Default is relative to this script
//   (tribelife-mobile/scripts/). Requires Node v22.18+ (built-in TypeScript
//   type stripping). Same .mjs rationale as scripts/verify-chat-draft.mjs.
//
// Planner-authored gate for quick task 261003-vpp. The committed copy in
// tribelife-mobile/scripts/ must stay byte-identical to the planning copy.
// Prints GROUP_LEAVE_OK on success, GROUP_LEAVE_FAIL <case...> otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const modPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '../utils/groupLeaveCopy.ts');
const fails = [];
const ok = (c, n) => { if (!c) fails.push(n); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const src = fs.readFileSync(modPath, 'utf8');
ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src), 'pure');
const M = await import(pathToFileURL(modPath).href);
ok(['leaveDialogVariant', 'leaveDialogCopy', 'leaveOutcomeNotice'].every((f) => typeof M[f] === 'function'), 'exports');
if (fails.length) { console.log('GROUP_LEAVE_FAIL ' + fails.join(' ')); process.exit(1); }

ok(M.LEAVE_PLAIN_TITLE === 'Leave Group'
  && M.LEAVE_PLAIN_MESSAGE === 'Are you sure you want to leave this group? You can rejoin with an invite link.'
  && M.LEAVE_CONFIRM === 'Leave', 'const:plain');
ok(M.LEAVE_HANDOFF_MESSAGE === "You're the last admin. When you leave, the longest-standing active member will become the group's admin.", 'const:handoff');
ok(M.LEAVE_ARCHIVE_TITLE === 'Archive this group?'
  && M.LEAVE_ARCHIVE_MESSAGE === "You're the last admin. If you leave, this group will be archived — no one will be able to send new messages."
  && M.LEAVE_ARCHIVE_CONFIRM === 'Leave & Archive', 'const:archive');
ok(M.LEAVE_ARCHIVED_NOTICE_TITLE === 'Group archived'
  && M.LEAVE_ARCHIVED_NOTICE_MESSAGE === 'No other member could take over as admin, so the group was archived.', 'const:notice');

// ── leaveDialogVariant ──────────────────────────────────────────────────────
const V = M.leaveDialogVariant;
const me = 7;
const admin = (userId) => ({ userId, role: 'admin' });
const member = (userId) => ({ userId, role: 'member' });
ok(V([admin(1), member(me)], me) === 'plain' && V([admin(1), { userId: me, role: null }], me) === 'plain'
  && V([member(me), member(2)], me) === 'plain' && V([{ userId: me, role: null }, member(2)], me) === 'plain', 'variant:member');
ok(V([], me) === 'plain' && V(null, me) === 'plain' && V(undefined, me) === 'plain' && V([admin(me), member(2)], null) === 'plain'
  && V([admin(me), member(2)], undefined) === 'plain' && V([admin(1), member(2)], me) === 'plain'
  && V([{ userId: undefined, role: 'admin' }], undefined) === 'plain' && V([{ userId: null, role: 'admin' }], null) === 'plain', 'variant:not-loaded');
ok(V([admin(me), admin(2), member(3)], me) === 'plain' && V([admin(me), admin(2)], me) === 'plain', 'variant:other-admin');
ok(V([admin(me), member(2)], me) === 'handoff' && V([member(3), admin(me), member(2)], me) === 'handoff'
  && V([admin(me), { userId: 2, role: null }], me) === 'handoff', 'variant:handoff');
ok(V([admin(me)], me) === 'archive', 'variant:archive-alone');
ok(V([admin(me), { userId: 2, role: 'kicked' }], me) === 'archive', 'variant:kicked-ignored');
{
  const list = [member(3), admin(me), member(2)];
  const before = JSON.stringify(list);
  V(list, me);
  ok(JSON.stringify(list) === before, 'variant:no-mutate');
}

// ── leaveDialogCopy ─────────────────────────────────────────────────────────
const C = M.leaveDialogCopy;
ok(eq(C('plain'), { title: 'Leave Group', message: 'Are you sure you want to leave this group? You can rejoin with an invite link.', confirmLabel: 'Leave' }), 'copy:plain');
ok(eq(C('handoff'), { title: 'Leave Group', message: "You're the last admin. When you leave, the longest-standing active member will become the group's admin.", confirmLabel: 'Leave' }), 'copy:handoff');
ok(!/archiv/i.test(C('handoff').message) && !/@/.test(C('handoff').message), 'copy:handoff-no-archive-no-name');
ok(eq(C('archive'), { title: 'Archive this group?', message: "You're the last admin. If you leave, this group will be archived — no one will be able to send new messages.", confirmLabel: 'Leave & Archive' }), 'copy:archive');

// ── leaveOutcomeNotice ──────────────────────────────────────────────────────
const N = M.leaveOutcomeNotice;
const NOTICE = { title: 'Group archived', message: 'No other member could take over as admin, so the group was archived.' };
ok(eq(N('handoff', true), NOTICE) && eq(N('plain', true), NOTICE), 'notice:unexpected-archive');
ok(N('archive', true) === null, 'notice:expected-archive');
ok(N('handoff', false) === null && N('plain', false) === null && N('archive', false) === null, 'notice:not-archived');
ok(N('handoff', undefined) === null && N('handoff', 'true') === null && N('handoff', 1) === null && N('plain', null) === null, 'notice:strict-true');

if (fails.length) { console.log('GROUP_LEAVE_FAIL ' + fails.join(' ')); process.exit(1); }
console.log('GROUP_LEAVE_OK');
