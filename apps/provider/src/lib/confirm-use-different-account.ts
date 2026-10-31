import { Alert } from "react-native";
import { router } from "expo-router";
import type { TFunction } from "i18next";

export function confirmUseDifferentAccount(
  t: TFunction,
  signOut: () => Promise<void>,
): void {
  Alert.alert(
    t("common.useDifferentAccountConfirmTitle") as string,
    t("common.useDifferentAccountConfirmBody") as string,
    [
      { text: t("common.cancel") as string, style: "cancel" },
      {
        text: t("common.signOut") as string,
        style: "destructive",
        onPress: () => {
          void signOut().then(() => router.replace("/(auth)/login" as never));
        },
      },
    ],
  );
}
