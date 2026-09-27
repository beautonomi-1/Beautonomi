import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  dismissHint,
  hintStorageKey,
  isHintDismissed,
} from "@/lib/contextual-hints/storage";

describe("contextual-hints storage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("shows once hint until dismissed", async () => {
    const key = hintStorageKey("test.hint");
    expect(await isHintDismissed(key)).toBe(false);
    await dismissHint(key);
    expect(await isHintDismissed(key)).toBe(true);
  });

  it("scopes provider hints per user", async () => {
    const keyA = hintStorageKey("test.hint", "user-a");
    const keyB = hintStorageKey("test.hint", "user-b");
    await dismissHint(keyA);
    expect(await isHintDismissed(keyA)).toBe(true);
    expect(await isHintDismissed(keyB)).toBe(false);
  });
});
