// Phase 12 D-09 follow-up: Chevra-initiated preview of a public group routes
// through this Globe-tab path so the bottom-nav indicator stays on Chevra
// (Expo Router tab focus follows file structure). Behavior is identical to
// the canonical chat screen — same component, same params, same socket
// hookup — but the route lives under the Globe stack instead of the Chat
// stack so tapping Chats while previewing returns the user to the Chats
// list as expected.
export { default } from '../../chat/[conversationId]';
