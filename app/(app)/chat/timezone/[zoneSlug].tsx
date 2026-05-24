// Chats-stack mirror of the Globe chat screen for non-native timezone rooms
// (Phase 15 TZRM-01). Mirrors the regional pattern (chat/regional/[roomSlug])
// so back-press returns to the Chats list and the bottom tab stays on Chats.
import { useLocalSearchParams } from 'expo-router';
import { GlobeRoomScreen } from '../../globe/[roomSlug]';

export default function ChatTimezoneRoom() {
  const { zoneSlug } = useLocalSearchParams<{ zoneSlug: string }>();
  return <GlobeRoomScreen slug={zoneSlug!} backLabel="Chats" />;
}
