// Phase 11 D-13: Chats-stack mirror of the Globe-stack chat screen.
// Re-exports the default so Expo Router registers the route and renders
// the same component. Stack-affinity preserved: tap from Chats list →
// back-press returns to Chats list (per Phase 9 D-04 contract). The
// shared `useLocalSearchParams<{ roomSlug: string }>()` call inside the
// component works because both segments name the param `[roomSlug]`.
export { default } from '../../globe/[roomSlug]';
