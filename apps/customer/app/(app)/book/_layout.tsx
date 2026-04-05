import { Stack } from "expo-router";

/**
 * Nested stack so URLs match web: `/book`, `/book/l/:slug`, `/book/continue` (universal links).
 */
export default function BookLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
