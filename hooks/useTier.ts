import { useAuthStore } from '@/store/authStore';
import type { Tier } from '@/types';

/**
 * Returns the authenticated user's current tier from server-driven
 * capabilities. Falls back to `'free'` when capabilities are not yet loaded.
 *
 * Tier reflects the LIVE capability state — premium expiry, org admin
 * promotion via membership, etc. — and updates on foreground refresh
 * (refreshSession) or 403 capabilityViolation retry.
 *
 * Example:
 *   const tier = useTier();
 *   if (tier === 'org_admin') { ... }
 */
export function useTier(): Tier {
  return useAuthStore((s) => s.capabilities?.tier ?? 'free');
}
