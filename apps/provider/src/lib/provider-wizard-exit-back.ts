
type NavState = {
  routes?: { name?: string; state?: NavState }[];
  index?: number;
};

function stackPreviousRouteName(state: NavState | undefined): string | null {
  if (!state?.routes?.length) return null;
  const idx = state.index ?? state.routes.length - 1;
  if (idx <= 0) return null;
  return state.routes[idx - 1]?.name ?? null;
}

function onboardingStackState(navigationState: NavState | undefined): NavState | undefined {
  const top = navigationState?.routes?.find((r) => r.name === "onboarding")?.state;
  if (top) return top;
  const app = navigationState?.routes?.find((r) => r.name === "(app)");
  return app?.state?.routes?.find((r) => r.name === "onboarding")?.state;
}

/** True when step-1 back should pop instead of offering sign-out. */
export function canProviderWizardStep1Pop(navigationState: NavState | undefined): boolean {
  const onboardingState = onboardingStackState(navigationState);
  const prevOnboarding = stackPreviousRouteName(onboardingState);
  if (prevOnboarding === "index" || prevOnboarding === "verify-identity") {
    return true;
  }

  const appState = navigationState?.routes?.find((r) => r.name === "(app)")?.state;
  const prevApp = stackPreviousRouteName(appState);
  if (prevApp === "(tabs)") {
    return true;
  }
  if (prevApp && prevApp !== "onboarding" && prevApp !== "index") {
    return true;
  }

  return false;
}

type WizardBackRouter = { back: () => void; canGoBack: () => boolean };

export function performProviderWizardStep1Back(
  router: WizardBackRouter,
  navigationState: NavState | undefined,
  onSignOut: () => void,
): void {
  if (canProviderWizardStep1Pop(navigationState) && router.canGoBack()) {
    router.back();
    return;
  }
  onSignOut();
}
