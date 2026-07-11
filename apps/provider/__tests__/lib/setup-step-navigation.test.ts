import {
  GUIDED_WIZARD_ROUTE,
  SETUP_HUB_ROUTE,
  resolveNextIncompleteRoute,
  resolveSetupStepRoute,
} from "@/lib/setup-step-navigation";

describe("setup-step-navigation", () => {
  it("prefers native_route for checklist steps", () => {
    expect(
      resolveSetupStepRoute({
        id: "identity-verification",
        native_route: "/(app)/(tabs)/more/settings/verification",
      }),
    ).toBe("/(app)/(tabs)/more/settings/verification");
  });

  it("uses wizard focus only for safe mappings", () => {
    expect(
      resolveSetupStepRoute({
        id: "services",
        native_route: null,
      }),
    ).toBe("/(app)/onboarding/wizard?focus=services");
  });

  it("falls back to hub for steps without safe wizard mapping", () => {
    expect(
      resolveSetupStepRoute({
        id: "identity-verification",
        native_route: null,
      }),
    ).toBe(SETUP_HUB_ROUTE);

    expect(
      resolveSetupStepRoute({
        id: "personal-profile",
        native_route: null,
      }),
    ).toBe(SETUP_HUB_ROUTE);

    expect(
      resolveSetupStepRoute({
        id: "payment-methods",
        native_route: null,
      }),
    ).toBe(SETUP_HUB_ROUTE);
  });

  it("resolveNextIncompleteRoute picks first required incomplete native screen", () => {
    expect(
      resolveNextIncompleteRoute([
        {
          id: "profile-details",
          required: true,
          completed: true,
          native_route: "/(app)/(tabs)/more/settings/business",
        },
        {
          id: "services",
          required: true,
          completed: false,
          native_route: "/(app)/(tabs)/more/catalogue",
        },
      ]),
    ).toBe("/(app)/(tabs)/more/catalogue");
  });

  it("resolveNextIncompleteRoute does not send identity to wizard step 2", () => {
    expect(
      resolveNextIncompleteRoute([
        {
          id: "identity-verification",
          required: true,
          completed: false,
          native_route: "/(app)/(tabs)/more/settings/verification",
        },
      ]),
    ).toBe("/(app)/(tabs)/more/settings/verification");
  });

  it("returns guided wizard when all steps complete", () => {
    expect(
      resolveNextIncompleteRoute([
        { id: "services", required: true, completed: true },
      ]),
    ).toBe(GUIDED_WIZARD_ROUTE);
  });
});
