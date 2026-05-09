import { useAuthStore } from '@/store/authStore';
import type { CapabilityFeatures, OrgRole } from '@/types';

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

/**
 * Returns whether the authenticated user has an active premium subscription.
 * Reads from `capabilities.isPremium` (server-derived, expiry-aware).
 * Falls back to `false` when capabilities are not yet loaded.
 *
 * UI HINT ONLY — server-side enforcement is authoritative.
 * Mirrors useCapability() selector pattern; returns a primitive (boolean)
 * so selector identity is stable and never causes extra rerenders.
 *
 * Example:
 *   const isPremium = useIsPremium();
 */
export function useIsPremium(): boolean {
  return useAuthStore((s) => s.capabilities?.isPremium ?? false);
}

/**
 * Returns the authenticated user's role in a specific org, or null if not a member.
 * Reads from caps.orgs[]; falls back to null when capabilities are not yet loaded.
 *
 * UI HINT ONLY — server-side enforcement of admin-only mutations is authoritative.
 *
 * Example:
 *   const role = useOrgRole(orgId);  // 'admin' | 'moderator' | 'member' | null
 */
export function useOrgRole(orgId: number): OrgRole | null {
  return useAuthStore((s) => s.capabilities?.orgs.find((o) => o.orgId === orgId)?.role ?? null);
}
