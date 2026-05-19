import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { clearPortalCache } from "@/lib/portal-cache";
import { api } from "@/lib/api-client";
import { useProvider } from "@/providers/ProviderContext";
import { coerceOwnerPhoneToE164ForForm, phoneNumbersMatchProfile } from "./onboarding-phone";
import {
  countVisibleSteps,
  getNextStep,
  getPreviousStep,
  INITIAL_FORM,
  STEPS,
  stepIsVisible,
  visibleStepIndex,
} from "./state";
import { buildSubmitPayload, validateStep } from "./validation";
import type { OnboardingFormData } from "./types";

const LOCAL_DRAFT_KEY = "beautonomi_provider_onboarding_draft_local";

type DraftRow = {
  draft_data?: Partial<OnboardingFormData>;
  current_step?: number;
} | null;

interface OnboardingWizardContextValue {
  formData: Partial<OnboardingFormData>;
  updateFormData: (u: Partial<OnboardingFormData>) => void;
  currentStep: number;
  setCurrentStep: (n: number) => void;
  goNext: () => void;
  goBack: () => void;
  skipForward: () => void;
  isSubmitting: boolean;
  savingDraft: boolean;
  loadingDraft: boolean;
  submit: () => Promise<void>;
  visibleTotal: number;
  visibleIndex: number;
  stepMeta: (typeof STEPS)[number] | undefined;
  canSkipCurrent: boolean;
}

const Ctx = createContext<OnboardingWizardContextValue | null>(null);

function mergePrefill(
  form: Partial<OnboardingFormData>,
  prefill: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    phone_verified?: boolean | null;
  }
) {
  const fn = typeof prefill.full_name === "string" ? prefill.full_name.trim() : "";
  const em = typeof prefill.email === "string" ? prefill.email.trim() : "";
  const ph = typeof prefill.phone === "string" ? prefill.phone.trim() : "";
  if (!form.owner_name?.trim() && fn) form.owner_name = fn;
  if (!form.owner_email?.trim() && em) form.owner_email = em;
  const e164 = coerceOwnerPhoneToE164ForForm(ph);
  if (!form.owner_phone?.trim() && e164) form.owner_phone = e164;
  const ownerDigits = form.owner_phone?.trim() || "";
  if (Boolean(prefill.phone_verified) && ownerDigits && phoneNumbersMatchProfile(ph, ownerDigits)) {
    form.phone_verified = true;
  }
  if (!form.phone?.trim() && form.owner_phone) form.phone = form.owner_phone;
  if (!form.email?.trim() && form.owner_email) form.email = form.owner_email;
}

interface OnboardingWizardProviderProps {
  children: ReactNode;
  /**
   * Optional starting step (1…STEPS.length). When provided, overrides the
   * step persisted on the saved draft so that deep-links from
   * dashboard/More can land the provider on a specific step (e.g. to fix
   * one missing field instead of restarting the whole wizard).
   */
  initialStep?: number;
}

export function OnboardingWizardProvider({ children, initialStep }: OnboardingWizardProviderProps) {
  const router = useRouter();
  const { refresh: refreshProvider } = useProvider();
  const [formData, setFormData] = useState<Partial<OnboardingFormData>>(() => ({
    ...INITIAL_FORM,
  }));
  const [currentStep, setCurrentStepState] = useState(1);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `initialStep` is meant to override the saved draft only on the first
  // open after navigation. We capture it once so later renders don't bounce
  // the user back when the draft loader resolves.
  const initialStepRef = useRef<number | undefined>(initialStep);

  const updateFormData = useCallback((u: Partial<OnboardingFormData>) => {
    setFormData((prev) => ({ ...prev, ...u }));
  }, []);

  const setCurrentStep = useCallback((n: number) => {
    setCurrentStepState(Math.min(Math.max(1, n), STEPS.length));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const merged: Partial<OnboardingFormData> = { ...INITIAL_FORM };
        let step = 1;

        const draftRes = await api.get<DraftRow>("/api/provider/onboarding/draft");
        const row = !draftRes.error ? (draftRes.data as DraftRow) : null;
        if (!cancelled && row && typeof row === "object" && row.draft_data) {
          Object.assign(merged, row.draft_data);
          if (typeof row.current_step === "number" && row.current_step >= 1) {
            step = row.current_step;
          }
          try {
            await AsyncStorage.removeItem(LOCAL_DRAFT_KEY);
          } catch {
            /* ignore */
          }
        } else {
          try {
            const raw = await AsyncStorage.getItem(LOCAL_DRAFT_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as {
                draft_data?: Partial<OnboardingFormData>;
                current_step?: number;
              };
              if (parsed.draft_data) Object.assign(merged, parsed.draft_data);
              if (typeof parsed.current_step === "number" && parsed.current_step >= 1) {
                step = parsed.current_step;
              }
            }
          } catch {
            /* ignore */
          }
        }

        const profileRes = await api.get<{
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          phone_verified?: boolean | null;
        }>("/api/me/profile");
        if (!cancelled && !profileRes.error && profileRes.data) {
          mergePrefill(merged, profileRes.data);
        }

        if (!cancelled) {
          setFormData(merged);
          // Deep-link override: when the wizard route received `?step=` or
          // `?focus=`, honor that instead of the draft's persisted step.
          const override = initialStepRef.current;
          const resolved =
            typeof override === "number" && override >= 1 && override <= STEPS.length
              ? override
              : step;
          setCurrentStepState(resolved);
        }
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistDraft = useCallback(async (data: Partial<OnboardingFormData>, step: number) => {
    setSavingDraft(true);
    try {
      const res = await api.post("/api/provider/onboarding/draft", {
        draft_data: data,
        current_step: step,
      });
      if (res.error) {
        try {
          await AsyncStorage.setItem(
            LOCAL_DRAFT_KEY,
            JSON.stringify({ draft_data: data, current_step: step })
          );
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        await AsyncStorage.removeItem(LOCAL_DRAFT_KEY);
      } catch {
        /* ignore */
      }
    } catch {
      try {
        await AsyncStorage.setItem(
          LOCAL_DRAFT_KEY,
          JSON.stringify({ draft_data: data, current_step: step })
        );
      } catch {
        /* ignore */
      }
    } finally {
      setSavingDraft(false);
    }
  }, []);

  useEffect(() => {
    if (loadingDraft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (formData.business_name || formData.address?.line1) {
        void persistDraft(formData, currentStep);
      }
    }, 2000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [formData, currentStep, loadingDraft, persistDraft]);

  // Auto-migrate currentStep when the form changes make it invisible — e.g.
  // toggling business_type away from "mobile" hides step 9 (Service zones).
  // Without this, the progress bar shows the wrong percentage and Next/Back
  // briefly skip over the invisible step on first interaction.
  useEffect(() => {
    if (loadingDraft) return;
    if (stepIsVisible(currentStep, formData)) return;
    const previous = getPreviousStep(currentStep, formData);
    const next = getNextStep(currentStep, formData);
    const target = next ?? previous ?? 1;
    if (target !== currentStep) setCurrentStepState(target);
  }, [formData, currentStep, loadingDraft]);

  const goNext = useCallback(() => {
    const v = validateStep(currentStep, formData);
    if (!v.valid) {
      Alert.alert("Check this step", v.errors[0] ?? "Please complete required fields.");
      return;
    }
    const next = getNextStep(currentStep, formData);
    if (next !== null) setCurrentStepState(next);
  }, [currentStep, formData]);

  const goBack = useCallback(() => {
    const prev = getPreviousStep(currentStep, formData);
    if (prev !== null) setCurrentStepState(prev);
    else router.back();
  }, [currentStep, formData, router]);

  const skipForward = useCallback(() => {
    const meta = STEPS[currentStep - 1];
    if (!meta?.canSkip) return;
    const next = getNextStep(currentStep, formData);
    if (next !== null) setCurrentStepState(next);
  }, [currentStep, formData]);

  const submit = useCallback(async () => {
    for (let s = 1; s <= STEPS.length; s++) {
      if (!stepIsVisible(s, formData)) continue;
      const v = validateStep(s, formData);
      if (!v.valid) {
        setCurrentStepState(s);
        Alert.alert("Almost there", v.errors[0] ?? "Complete this step first.");
        return;
      }
    }

    if (!formData.team_size) {
      Alert.alert("Missing info", "Please select your team size.");
      setCurrentStepState(1);
      return;
    }
    if (!formData.phone_verified) {
      Alert.alert("Verify phone", "Please verify your phone number.");
      setCurrentStepState(2);
      return;
    }
    if (!formData.global_category_ids?.length) {
      Alert.alert("Categories", "Select at least one category.");
      setCurrentStepState(10);
      return;
    }

    const payload = buildSubmitPayload(formData);
    const addr = payload.address as { line1?: string; city?: string; country?: string };
    if (!addr.line1 || !addr.city || !addr.country) {
      Alert.alert("Address", "Please complete address (line 1, city, country).");
      setCurrentStepState(7);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<{
        message?: string;
        subscription_endpoint?: string | null;
        selected_plan_id?: string | null;
        selected_plan_is_free?: boolean;
        requires_checkout?: boolean;
        checkout_path?: string | null;
      }>("/api/provider/onboarding", payload as Record<string, unknown>);

      if (res.error) {
        const details = (res.error as { details?: unknown }).details;
        const msg =
          typeof details === "string"
            ? details
            : Array.isArray(details)
              ? details
                  .map((d: { message?: string }) => d.message)
                  .filter(Boolean)
                  .join("\n")
              : res.error.message;
        Alert.alert("Could not finish setup", msg || "Please try again.");
        return;
      }

      const data = res.data as {
        message?: string;
        subscription_endpoint?: string | null;
        selected_plan_id?: string | null;
        selected_plan_is_free?: boolean;
        requires_checkout?: boolean;
        checkout_path?: string | null;
      } | null;

      try {
        await AsyncStorage.removeItem(LOCAL_DRAFT_KEY);
      } catch {
        /* ignore */
      }

      clearPortalCache();
      await refreshProvider();

      const planId = data?.selected_plan_id;
      // §Provider-launch (2026-05): trust the server's explicit `requires_checkout`
      // signal instead of re-deriving paid/free on the client. Fall back to the
      // legacy `subscription_endpoint` field if the server hasn't been redeployed.
      const requiresCheckout = data?.requires_checkout ?? Boolean(data?.subscription_endpoint);

      if (planId && requiresCheckout) {
        const { getBackendUrl } = await import("@/config/public-env");
        const base = (getBackendUrl() || "").replace(/\/$/, "");
        if (!base) {
          // Don't pretend they're live when a paid plan still needs payment.
          Alert.alert(
            "Couldn't open payment page",
            "We saved your profile, but we can't open the secure payment page from this build. Please open Beautonomi in your browser to complete payment, or contact support.",
            [
              {
                text: "Open subscription settings",
                onPress: () => {
                  router.replace("/(app)/(tabs)/more/settings/subscription" as never);
                },
              },
            ]
          );
          return;
        }

        const checkoutPath =
          data?.checkout_path ||
          `/provider/subscription-checkout?planId=${encodeURIComponent(planId)}`;
        const separator = checkoutPath.includes("?") ? "&" : "?";
        const url = `${base}${checkoutPath}${separator}in_app=1&return_to=dashboard`;
        router.replace({
          pathname: "/(app)/(tabs)/more/in-app-browser",
          params: {
            url: encodeURIComponent(url),
            title: "Complete subscription",
          },
        } as never);
        return;
      }

      const isFreePlan = data?.selected_plan_is_free === true;
      const welcomeMsg =
        data?.message ??
        (isFreePlan
          ? "Your free plan is active and your profile is live."
          : "Your provider profile is ready.");
      const goDashboard = () => {
        router.replace("/(app)/(tabs)/dashboard" as never);
      };
      Alert.alert(isFreePlan ? "You're on the free plan" : "You're live", welcomeMsg, [
        { text: "Go to dashboard", onPress: goDashboard },
      ]);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, refreshProvider, router]);

  const visibleTotal = useMemo(() => countVisibleSteps(formData), [formData]);
  const visibleIndex = useMemo(
    () => visibleStepIndex(currentStep, formData),
    [currentStep, formData]
  );
  const stepMeta = STEPS[currentStep - 1];
  const canSkipCurrent = Boolean(stepMeta?.canSkip);

  const value = useMemo(
    () => ({
      formData,
      updateFormData,
      currentStep,
      setCurrentStep,
      goNext,
      goBack,
      skipForward,
      isSubmitting,
      savingDraft,
      loadingDraft,
      submit,
      visibleTotal,
      visibleIndex,
      stepMeta,
      canSkipCurrent,
    }),
    [
      formData,
      updateFormData,
      currentStep,
      setCurrentStep,
      goNext,
      goBack,
      skipForward,
      isSubmitting,
      savingDraft,
      loadingDraft,
      submit,
      visibleTotal,
      visibleIndex,
      stepMeta,
      canSkipCurrent,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboardingWizard() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOnboardingWizard must be used within OnboardingWizardProvider");
  return c;
}
