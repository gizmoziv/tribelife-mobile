// verify-invite.mjs
//
// OFFLINE ONLY — never imported by app code. Exercises utils/inviteText.ts (pure
// invite helpers) and utils/phoneIntl.ts (libphonenumber-js wrapper) behind the
// Invite Contacts screen (Phase 48) with plain inputs: no React Native, no
// network, no database.
//
// Usage (from tribelife-mobile/): node --no-warnings scripts/verify-invite.mjs
//   Requires Node v22.18+ (built-in TypeScript type stripping). Same .mjs
//   rationale as scripts/verify-candle-viewmodel.mjs.
//
// Prints INVITE_OK <passed>/<total> on success, INVITE_FAIL <case ids> otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const textPath = path.resolve(here, '../utils/inviteText.ts');
const phonePath = path.resolve(here, '../utils/phoneIntl.ts');
const T = await import(pathToFileURL(textPath).href);
const P = await import(pathToFileURL(phonePath).href);

let total = 0;
const fails = [];
const ok = (cond, id) => {
  total += 1;
  if (!cond) fails.push(id);
};
const eq = (a, b, id) => ok(JSON.stringify(a) === JSON.stringify(b), id);
const fn = (name) => (typeof T[name] === 'function' ? T[name] : () => undefined);
const intl = typeof P.intlPhone === 'function' ? P.intlPhone : () => undefined;

const L = 'https://tribelife.app/u/dana_k?ref=dana_k';

// 1. inviteLink
eq(fn('inviteLink')('dana_k'), L, 'link:plain');
eq(fn('inviteLink')('a b'), 'https://tribelife.app/u/a%20b?ref=a%20b', 'link:encoded');

// 2. personalInvite / genericInvite
eq(
  fn('personalInvite')('Dana', L),
  "Hey Dana! I'm on TribeLife — a global Jewish community app. Join me: " + L,
  'invite:named',
);
eq(
  fn('personalInvite')('', L),
  "Hey! I'm on TribeLife — a global Jewish community app. Join me: " + L,
  'invite:anon',
);
eq(fn('genericInvite')(L), fn('personalInvite')('', L), 'invite:generic');

// 3. firstNameOf
eq(fn('firstNameOf')('  Dana ', 'Dana Levi'), 'Dana', 'first:given');
eq(fn('firstNameOf')(null, 'Moshe Cohen'), 'Moshe', 'first:fullToken');
eq(fn('firstNameOf')(null, 'שרה כהן'), 'שרה', 'first:hebrew');
eq(fn('firstNameOf')(null, null), '', 'first:null');
eq(fn('firstNameOf')('', '   '), '', 'first:blank');

// 4. displayNameOf
eq(fn('displayNameOf')('Dana Levi', null, null, 'x'), 'Dana Levi', 'display:full');
eq(fn('displayNameOf')(null, 'Dana', 'Levi', 'x'), 'Dana Levi', 'display:joined');
eq(fn('displayNameOf')(null, null, null, '054-1'), '054-1', 'display:fallback');

// 5. pickPhones
eq(
  fn('pickPhones')([
    { label: 'home', number: '03-555-1234' },
    { label: 'mobile', number: '054-123-4567' },
    { label: 'mobile', number: '0541234567' },
    { label: 'work', number: '' },
  ]),
  ['054-123-4567', '03-555-1234'],
  'phones:mobileFirstDedupe',
);
eq(
  fn('pickPhones')([
    { label: 'work', number: '+1 212 555 0100' },
    { label: 'iPhone', number: '+1 305 555 0123' },
  ]),
  ['+1 305 555 0123', '+1 212 555 0100'],
  'phones:iphoneFirst',
);
eq(fn('pickPhones')([]), [], 'phones:empty');

// 6. initialOf
eq(fn('initialOf')('dana'), 'D', 'initial:latin');
eq(fn('initialOf')('😀 Party'), '😀', 'initial:emoji');
eq(fn('initialOf')(''), '#', 'initial:empty');
eq(fn('initialOf')('שרה'), 'ש', 'initial:hebrew');

// 7. sectionKeyOf
eq(fn('sectionKeyOf')('dana'), 'D', 'section:latin');
eq(fn('sectionKeyOf')('שרה'), 'ש', 'section:hebrew');
eq(fn('sectionKeyOf')('123 Pizza'), '#', 'section:digit');
eq(fn('sectionKeyOf')('😀'), '#', 'section:emoji');

// 8. isRTLText
eq(fn('isRTLText')('שרה'), true, 'rtl:hebrew');
eq(fn('isRTLText')('Dana'), false, 'rtl:latin');

// 9. invitedLabel
const lbl = fn('invitedLabel')('2026-11-22T10:00:00.000Z');
ok(typeof lbl === 'string' && lbl.startsWith('✓ Invited · ') && lbl.length > '✓ Invited · '.length, 'invited:valid');
eq(fn('invitedLabel')('nope'), '', 'invited:invalid');

// 10. whatsAppUrl
eq(fn('whatsAppUrl')('972541234567', 'Hi & bye'), 'https://wa.me/972541234567?text=Hi%20%26%20bye', 'wa:digits');
eq(fn('whatsAppUrl')(null, 'x y'), 'https://wa.me/?text=x%20y', 'wa:generic');

// 11. parseInvitedMap
eq(fn('parseInvitedMap')('{"a":"2026-11-22T10:00:00.000Z"}'), { a: '2026-11-22T10:00:00.000Z' }, 'map:valid');
eq(fn('parseInvitedMap')('garbage'), {}, 'map:garbage');
eq(fn('parseInvitedMap')(null), {}, 'map:null');
eq(fn('parseInvitedMap')('[1]'), {}, 'map:array');
eq(fn('parseInvitedMap')('{"a":1,"b":"x"}'), { b: 'x' }, 'map:stringsOnly');

// 12. parseIdList
eq(fn('parseIdList')('["1","2"]'), ['1', '2'], 'ids:valid');
eq(fn('parseIdList')('{"a":1}'), [], 'ids:object');
eq(fn('parseIdList')(null), [], 'ids:null');
eq(fn('parseIdList')('[1,"2"]'), ['2'], 'ids:stringsOnly');

// 13. intlPhone (libphonenumber-js)
const il = intl('054-123-4567', 'IL');
ok(il && il.waDigits === '972541234567' && il.display.startsWith('+972'), 'intl:ilNational');
const usIntl = intl('+1 (305) 555-0123', 'IL');
ok(usIntl && usIntl.waDigits === '13055550123', 'intl:plusUsFromIl');
const usNat = intl('(305) 555-0123', 'US');
ok(usNat && usNat.waDigits === '13055550123', 'intl:usNational');
const idd = intl('011 972 54 123 4567', 'US');
ok(idd && idd.waDigits === '972541234567', 'intl:usIdd');
const plus = intl('+972 54 123 4567', null);
ok(plus && plus.waDigits === '972541234567', 'intl:plusNoRegion');
eq(intl('054-123-4567', null), null, 'intl:nationalNoRegion');
eq(intl('12', 'IL'), null, 'intl:tooShort');
eq(intl('hello', 'US'), null, 'intl:text');

// 13b. linkedInShareUrl
eq(
  fn('linkedInShareUrl')(L),
  'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Ftribelife.app%2Fu%2Fdana_k%3Fref%3Ddana_k',
  'linkedin:encoded',
);
ok(!String(fn('linkedInShareUrl')(L)).includes('?ref='), 'linkedin:noRawRef');

// 13c. matchesQuery
const mq = fn('matchesQuery');
ok(mq('Dana Levi', ['054-123-4567'], '') === true, 'mq:empty');
ok(mq('Dana Levi', ['054-123-4567'], '   ') === true, 'mq:blank');
ok(mq('Dana Levi', [], 'lev') === true, 'mq:nameSub');
ok(mq('Dana Levi', [], 'LEVI') === true, 'mq:nameCase');
ok(mq('Dana Levi', [], 'xyz') === false, 'mq:nameMiss');
ok(mq('שרה כהן', [], 'כהן') === true, 'mq:hebrew');
ok(mq('Dana Levi', ['054-123-4567'], '0541') === true, 'mq:digits');
ok(mq('Dana Levi', ['054-123-4567'], '999') === false, 'mq:digitsMiss');
ok(mq('Dana Levi', ['054-123-4567'], '5') === false, 'mq:oneDigit');
ok(mq('Dana Levi', ['054-123-4567'], ' 054 123 ') === true, 'mq:digitsSpaced');

// 13d. hiddenNote
const hn = fn('hiddenNote');
eq(hn(0), '', 'hidden:zero');
eq(hn(1), "1 contact without a phone number isn't shown", 'hidden:one');
eq(hn(7), "7 contacts without a phone number aren't shown", 'hidden:many');

// 14. Module hygiene
const textSrc = fs.readFileSync(textPath, 'utf8');
ok(
  !/^\s*import\s/m.test(textSrc) && !/require\(/.test(textSrc) && !textSrc.includes('react-native'),
  'hygiene:inviteText',
);
const phoneSrc = fs.readFileSync(phonePath, 'utf8');
const phoneImports = phoneSrc.match(/^\s*import\s[^;]*;/gm) ?? [];
ok(
  phoneImports.length === 1 && phoneImports[0].includes("'libphonenumber-js'") && !/require\(/.test(phoneSrc),
  'hygiene:phoneIntl',
);

if (fails.length) {
  console.log('INVITE_FAIL ' + fails.join(' '));
  process.exit(1);
}
console.log(`INVITE_OK ${total}/${total}`);
