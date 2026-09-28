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

  it("uses a versioned device-scoped key", () => {
    expect(hintStorageKey("customer.customRequest.create")).toBe("hint:v1:customer.customRequest.create");
  });

  it("shows once hint until dismissed", async () => {
    const key = hintStorageKey("test.hint");
    expect(await isHintDismissed(key)).toBe(false);
    await dismissHint(key);
    expect(await isHintDismissed(key)).toBe(true);
  });
});
