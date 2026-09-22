describe("device-default-country-dial", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses locale for visitor country even when phone region env is ZA", async () => {
    process.env.EXPO_PUBLIC_DEFAULT_PHONE_REGION = "ZA";
    jest.doMock("expo-localization", () => ({
      getLocales: () => [{ regionCode: "US" }],
    }));
    const spy = jest
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ timeZone: "America/Chicago" } as Intl.ResolvedDateTimeFormatOptions);

    const mod = await import("@/lib/device-default-country-dial");
    expect(mod.getDeviceLocaleCountryIso()).toBe("US");
    expect(mod.getDevicePhoneRegionIso()).toBe("ZA");
    spy.mockRestore();
  });
});
