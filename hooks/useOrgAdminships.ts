import { useAuthStore } from '@/store/authStore';
import type { OrgMembership } from '@/types';

/**
 * Returns the authenticated user's organization memberships filtered to
 * those where they hold the `admin` role. Empty array when the user is not
 * an admin in any org (or capabilities are not yet loaded).
 *
 * Use this to drive admin-only UI affordances (e.g. "Manage Org" entry
 * point, invite-members button, role management screen). Server-side
 * enforcement on `/api/orgs/:id/invite` is authoritative — this is a UI
 * hint only.
 *
 * Example:
 *   const adminships = useOrgAdminships();
 *   if (adminships.length > 0) {
 *     // show "My Organizations" section
 *   }
 */
export function useOrgAdminships(): OrgMembership[] {
  return useAuthStore(
    (s) => s.capabilities?.orgs.filter((m) => m.role === 'admin') ?? [],
  );
}
