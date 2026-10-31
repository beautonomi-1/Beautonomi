import { canProviderWizardStep1Pop } from "@/lib/provider-wizard-exit-back";

describe("canProviderWizardStep1Pop", () => {
  it("allows pop when onboarding previous route is checklist index", () => {
    const state = {
      routes: [
        {
          name: "(app)",
          state: {
            routes: [
              {
                name: "onboarding",
                state: {
                  routes: [{ name: "index" }, { name: "wizard" }],
                  index: 1,
                },
              },
            ],
            index: 0,
          },
        },
      ],
    };
    expect(canProviderWizardStep1Pop(state)).toBe(true);
  });

  it("allows pop when app previous route is tabs", () => {
    const state = {
      routes: [
        {
          name: "(app)",
          state: {
            routes: [{ name: "(tabs)" }, { name: "onboarding" }],
            index: 1,
          },
        },
      ],
    };
    expect(canProviderWizardStep1Pop(state)).toBe(true);
  });

  it("does not pop when only root index is underneath", () => {
    const state = {
      routes: [
        { name: "index" },
        {
          name: "(app)",
          state: {
            routes: [
              {
                name: "onboarding",
                state: {
                  routes: [{ name: "wizard" }],
                  index: 0,
                },
              },
            ],
            index: 0,
          },
        },
      ],
      index: 1,
    };
    expect(canProviderWizardStep1Pop(state)).toBe(false);
  });
});
