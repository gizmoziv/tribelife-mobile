// Mirror of tribelife-backend/src/types/capabilities.ts. Hand-synced —
// keep field names, types, and CAPABILITIES_VERSION in lock-step with the
// backend. Mobile reads this object as a UI hint only; server-side
// enforcement is authoritative (Phase 3).

export const CAPABILITIES_VERSION = 1;

export type Tier = 'free' | 'premium' | 'org_admin' | 'staff';

export type OrgRole = 'admin' | 'moderator' | 'member';

export interface OrgMembership {
  orgId: number;
  role: OrgRole;
  slug: string;
  name: string;
  iconUrl: string | null;
}

export interface CapabilityLimits {
  maxBeacons: number;
  maxGroupsOwned: number;
  maxGroupMembers: number;
  maxOrgsOwned: number;
}

export interface CapabilityFeatures {
  canCreatePublicGroup: boolean;
  canCreatePrivateGroup: boolean;
  canCreateOrg: boolean;
  canSendDM: boolean;
  canPostBeacon: boolean;
  canTranslateMessages: boolean;
}

export interface Capabilities {
  version: number;
  computedAt: string;
  tier: Tier;
  isPremium: boolean;
  isStaff: boolean;
  limits: CapabilityLimits;
  features: CapabilityFeatures;
  orgs: OrgMembership[];
}
