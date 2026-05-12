import React from 'react';
// Town Square in the Chats tab stack.
//
// Renders the Globe room screen for the 'town-square' slug but lives inside
// the Chats tab navigator, so the back button returns to the Chats list
// instead of the Globe tab.  Bug 3 fix from Phase 9 UAT (CHATS-04).
//
// GlobeRoomScreen accepts a slug prop so it can be reused across stacks
// without needing to read from Expo Router params.
import { GlobeRoomScreen } from '@/app/(app)/globe/[roomSlug]';

export default function TownSquareChatScreen() {
  return <GlobeRoomScreen slug="town-square" backLabel="Chats" />;
}
