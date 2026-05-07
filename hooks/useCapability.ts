import { useAuthStore } from '@/store/authStore';
import type { CapabilityFeatures } from '@/types';

/**
 * Returns the boolean value of a capability feature for the authenticated
 * user. Falls back to `false` when capabilities are not yet loaded
 * (e.g. before session restore completes).
 *
 * UI HINT ONLY — server-side enforcement (Phase 3) is authoritative.
 * Patching the store cannot bypass server gates.
 *
 * Example:
 *   const canPrivate = useCapability('canCreatePrivateGroup');
 */
export function useCapability<K extends keyof CapabilityFeatures>(feature: K): boolean {
  return useAuthStore((s) => s.capabilities?.features[feature] ?? false);
}
