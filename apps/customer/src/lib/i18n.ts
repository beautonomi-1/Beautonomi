import { initI18n } from "@beautonomi/i18n";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

const deviceLocale = Localization.getLocales()[0]?.languageCode || "en";
initI18n(deviceLocale);

AsyncStorage.getItem("beautonomi_locale").then((saved) => {
  if (saved && saved !== deviceLocale) {
    import("@beautonomi/i18n").then(({ i18n }) => i18n.changeLanguage(saved));
  }
});

export async function changeLanguage(code: string) {
  const { i18n } = await import("@beautonomi/i18n");
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem("beautonomi_locale", code);
}
