// Phase 11 D-13: Chats-stack mirror of the Globe-stack chat screen.
// Renders the same GlobeRoomScreen, but passes backLabel="Chats" so the
// inline custom header's back pill reads "Chats" instead of "Globe" when
// the user reached the room via the Chats tab (stack-affinity per Phase 9
// D-04). The shared `useLocalSearchParams<{ roomSlug: string }>()` call
// works because both segments name the param `[roomSlug]`.
import { useLocalSearchParams } from 'expo-router';
import { GlobeRoomScreen } from '../../globe/[roomSlug]';

export default function ChatRegionalRoom() {
  const { roomSlug } = useLocalSearchParams<{ roomSlug: string }>();
  return <GlobeRoomScreen slug={roomSlug!} backLabel="Chats" />;
}
