// Phase 44 intro gate constants. Mirrors tribelife-backend/src/lib/introGate.ts;
// the server enforces the same limits (D-07). The ideas are fixed app text (D-09).

export const INTRO_MIN_LENGTH = 10;
export const INTRO_MAX_LENGTH = 500;

export const INTRO_PLACEHOLDER = "Hi! I'm… from… I joined TribeLife to…";

export const INTRO_IDEAS: readonly string[] = [
  'Your name',
  "Where you're from",
  'Why you joined TribeLife',
  "What you're looking for",
  'Something you enjoy',
];
