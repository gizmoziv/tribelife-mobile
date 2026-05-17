import { Redirect, useLocalSearchParams } from 'expo-router';

export default function UShortcut() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  if (!handle) return <Redirect href="/" />;
  return <Redirect href={`/user/${handle}`} />;
}
