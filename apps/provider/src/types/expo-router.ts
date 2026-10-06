import { useRouter } from "expo-router";

/** Expo Router instance type (SDK 57 no longer exports `Router`). */
export type ExpoRouter = ReturnType<typeof useRouter>;
