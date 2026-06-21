/**
 * Regression test for the OneSignal "Must call 'initWithContext' before use"
 * crash. The native SDK throws that exact error whenever any OneSignal API is
 * touched before `OneSignal.initialize()` runs. The mock below faithfully
 * reproduces that behavior, so each helper in `onesignal-client` must guarantee
 * initialization before calling a native API — otherwise these tests fail.
 */

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock("@/config/public-env", () => ({
  ONE_SIGNAL_APP_ID: "app-id-from-env",
}));

jest.mock("@/lib/third-party-config", () => ({
  getOneSignalAppId: jest.fn(async () => "app-id-123"),
}));

// Native SDK emulation: any API call before `initialize()` throws the real
// error string and increments a counter we assert stays at zero.
jest.mock("react-native-onesignal", () => {
  let nativeInitialized = false;
  let beforeUseCount = 0;
  const assertInit = () => {
    if (!nativeInitialized) {
      beforeUseCount += 1;
      throw new Error("Must call 'initWithContext' before use");
    }
  };
  const OneSignal = {
    Debug: { setLogLevel: jest.fn() },
    initialize: jest.fn(() => {
      nativeInitialized = true;
    }),
    login: jest.fn(() => assertInit()),
    logout: jest.fn(() => assertInit()),
    User: {
      getExternalId: jest.fn(async () => {
        assertInit();
        return null;
      }),
      pushSubscription: {
        getIdAsync: jest.fn(async () => {
          assertInit();
          return "sub-123";
        }),
        addEventListener: jest.fn(() => assertInit()),
        removeEventListener: jest.fn(() => assertInit()),
      },
    },
    Notifications: {
      getPermissionAsync: jest.fn(async () => {
        assertInit();
        return true;
      }),
      requestPermission: jest.fn(async () => {
        assertInit();
        return true;
      }),
      addEventListener: jest.fn(() => assertInit()),
      removeEventListener: jest.fn(() => assertInit()),
    },
  };
  return {
    LogLevel: { None: 0 },
    OneSignal,
    __getBeforeUseCount: () => beforeUseCount,
  };
});

type OneSignalMockModule = {
  OneSignal: {
    initialize: jest.Mock;
    login: jest.Mock;
  };
  __getBeforeUseCount: () => number;
};

beforeEach(() => {
  jest.resetModules();
});

function loadMocks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const onesignal = require("react-native-onesignal") as unknown as OneSignalMockModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = require("@/lib/onesignal-client") as typeof import("@/lib/onesignal-client");
  return { onesignal, client };
}

describe("onesignal-client init ordering", () => {
  it("getOneSignalSubscriptionId initializes before reading the subscription id", async () => {
    const { onesignal, client } = loadMocks();
    const id = await client.getOneSignalSubscriptionId();
    expect(onesignal.OneSignal.initialize).toHaveBeenCalledTimes(1);
    expect(id).toBe("sub-123");
    expect(onesignal.__getBeforeUseCount()).toBe(0);
  });

  it("requestOneSignalPushPermission initializes before prompting", async () => {
    const { onesignal, client } = loadMocks();
    const accepted = await client.requestOneSignalPushPermission(true);
    expect(onesignal.OneSignal.initialize).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
    expect(onesignal.__getBeforeUseCount()).toBe(0);
  });

  it("getOneSignalPermissionAsync initializes before checking permission", async () => {
    const { onesignal, client } = loadMocks();
    const granted = await client.getOneSignalPermissionAsync();
    expect(onesignal.OneSignal.initialize).toHaveBeenCalledTimes(1);
    expect(granted).toBe(true);
    expect(onesignal.__getBeforeUseCount()).toBe(0);
  });

  it("ensureOneSignalExternalId initializes and binds the user before reading the external id", async () => {
    const { onesignal, client } = loadMocks();
    await client.ensureOneSignalExternalId("user-1");
    expect(onesignal.OneSignal.initialize).toHaveBeenCalledTimes(1);
    expect(onesignal.OneSignal.login).toHaveBeenCalledWith("user-1");
    expect(onesignal.__getBeforeUseCount()).toBe(0);
  });

  it("addOneSignalPermissionObserver initializes before attaching the listener", async () => {
    const { onesignal, client } = loadMocks();
    const unsubscribe = client.addOneSignalPermissionObserver(() => {});
    // Observer attaches in a microtask; flush before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onesignal.OneSignal.initialize).toHaveBeenCalledTimes(1);
    expect(onesignal.__getBeforeUseCount()).toBe(0);
    unsubscribe();
  });

  it("ensureOneSignalInitialized initializes exactly once across concurrent callers", async () => {
    const { onesignal, client } = loadMocks();
    await Promise.all([
      client.ensureOneSignalInitialized("app-id-123", "user-1"),
      client.ensureOneSignalInitialized("app-id-123", "user-1"),
      client.ensureOneSignalInitialized("app-id-123", "user-1"),
    ]);
    expect(onesignal.OneSignal.initialize).toHaveBeenCalledTimes(1);
    expect(onesignal.OneSignal.login).toHaveBeenCalledWith("user-1");
    expect(onesignal.__getBeforeUseCount()).toBe(0);
  });

  it("logoutOneSignal is a no-op (no native call) when never initialized", async () => {
    const { onesignal, client } = loadMocks();
    const result = await client.logoutOneSignal();
    expect(result).toBeNull();
    expect(onesignal.OneSignal.initialize).not.toHaveBeenCalled();
    expect(onesignal.OneSignal.logout).not.toHaveBeenCalled();
    expect(onesignal.__getBeforeUseCount()).toBe(0);
  });
});

