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
import { Alert, Keyboard } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { coerceOwnerPhoneToE164ForForm, phoneNumbersMatchProfile } from "./onboarding-phone";
import { applySignupPhoneHandoffToForm } from "@/lib/auth/signup-phone-handoff";
import { isMailableEmail } from "@beautonomi/utils";
import {
  finalizeOnboardingSuccess,
  probeProviderProfileExists,
  resolveCheckoutFlagsForRecovery,
  type OnboardingCompletionData,
} from "./finalize-onboarding";
import {
  countVisibleSteps,
  CATEGORIES_STEP_ID,
  getNextStep,
  getPreviousStep,
  INITIAL_FORM,
  REVIEW_STEP_ID,
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
  /**
   * Jump to an earlier step from the Review step. The next Continue (or Back)
   * returns straight to Review instead of walking the whole wizard again.
   */
  editFromReview: (n: number) => void;
  /** True while the user is editing a step they jumped to from Review. */
  editingFromReview: boolean;
  goNext: () => void;
  goBack: () => void;
  skipForward: () => void;
  isSubmitting: boolean;
  providerProfileExists: boolean;
  continueToApp: () => void;
  submitLabel: string;
  submitBusyLabel: string;
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
    email_verified?: boolean | null;
    phone?: string | null;
    phone_verified?: boolean | null;
  }
) {
  const fn = typeof prefill.full_name === "string" ? prefill.full_name.trim() : "";
  const em = typeof prefill.email === "string" ? prefill.email.trim() : "";
  const ph = typeof prefill.phone === "string" ? prefill.phone.trim() : "";
  if (!form.owner_name?.trim() && fn) form.owner_name = fn;
  if (!form.owner_email?.trim() && em && isMailableEmail(em)) form.owner_email = em;
  const e164 = coerceOwnerPhoneToE164ForForm(ph);
  if (!form.owner_phone?.trim() && e164) form.owner_phone = e164;
  const ownerDigits = form.owner_phone?.trim() || "";
  if (Boolean(prefill.phone_verified) && ownerDigits && phoneNumbersMatchProfile(ph, ownerDigits)) {
    form.phone_verified = true;
  }
  if (
    Boolean(prefill.email_verified) &&
    form.owner_email &&
    isMailableEmail(form.owner_email) &&
    em &&
    form.owner_email.trim().toLowerCase() === em.trim().toLowerCase()
  ) {
    form.email_verified = true;
  }
  if (!form.phone?.trim() && form.owner_phone) form.phone = form.owner_phone;
  if (!form.email?.trim() && form.owner_email && isMailableEmail(form.owner_email)) {
    form.email = form.owner_email;
  }
}

function scrubPlaceholderEmailsFromOnboardingForm(form: Partial<OnboardingFormData>) {
  if (form.owner_email && !isMailableEmail(form.owner_email)) {
    form.owner_email = "";
    form.email_verified = false;
  }
  if (form.email && !isMailableEmail(form.email)) {
    form.email = "";
  }
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
  /**
   * When true, `?focus=` was present but did not map to a wizard step.
   * Do not resume the draft at an arbitrary step (often step 2 phone/email).
   */
  focusUnmapped?: boolean;
}

function resolveWizardEntryStep(
  draftStep: number,
  initialStep: number | undefined,
  focusUnmapped: boolean,
  form: Partial<OnboardingFormData>,
): number {
  let resolved: number;
  if (
    focusUnmapped &&
    !(typeof initialStep === "number" && initialStep >= 1 && initialStep <= STEPS.length)
  ) {
    resolved = 1;
  } else if (
    typeof initialStep === "number" &&
    initialStep >= 1 &&
    initialStep <= STEPS.length
  ) {
    resolved = initialStep;
  } else {
    resolved = draftStep;
  }

  if (
    resolved === 2 &&
    form.email_verified === true &&
    form.phone_verified === true
  ) {
    const next = getNextStep(2, form);
    if (next) resolved = next;
  }

  return resolved;
}

export function OnboardingWizardProvider({
  children,
  initialStep,
  focusUnmapped = false,
}: OnboardingWizardProviderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh: refreshProvider } = useProvider();
  const [formData, setFormData] = useState<Partial<OnboardingFormData>>(() => ({
    ...INITIAL_FORM,
  }));
  const [currentStep, setCurrentStepState] = useState(1);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providerProfileExists, setProviderProfileExists] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmittingRef = useRef(false);
  // `initialStep` is meant to override the saved draft only on the first
  // open after navigation. We capture it once so later renders don't bounce
  // the user back when the draft loader resolves.
  const initialStepRef = useRef<number | undefined>(initialStep);
  const focusUnmappedRef = useRef(focusUnmapped);

  useEffect(() => {
    initialStepRef.current = initialStep;
    focusUnmappedRef.current = focusUnmapped;
  }, [initialStep, focusUnmapped]);
  const paystackCheckout = useInAppPaystackCheckout();

  const updateFormData = useCallback((u: Partial<OnboardingFormData>) => {
    setFormData((prev) => ({ ...prev, ...u }));
  }, []);

  const setCurrentStep = useCallback((n: number) => {
    setCurrentStepState(Math.min(Math.max(1, n), STEPS.length));
  }, []);

  const [editingFromReview, setEditingFromReview] = useState(false);

  const editFromReview = useCallback((n: number) => {
    setCurrentStepState(Math.min(Math.max(1, n), STEPS.length));
    setEditingFromReview(true);
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
          email_verified?: boolean | null;
          phone?: string | null;
          phone_verified?: boolean | null;
        }>("/api/me/profile");
        if (!cancelled && !profileRes.error && profileRes.data) {
          mergePrefill(merged, profileRes.data);
        }
        if (!cancelled) {
          scrubPlaceholderEmailsFromOnboardingForm(merged);
          await applySignupPhoneHandoffToForm(merged);
        }

        const providerExists = await probeProviderProfileExists();
        if (!cancelled) {
          setProviderProfileExists(providerExists);
        }

        if (!cancelled) {
          setFormData(merged);
          const resolved = resolveWizardEntryStep(
            step,
            initialStepRef.current,
            focusUnmappedRef.current,
            merged,
          );
          setCurrentStepState(resolved);

          // Do not auto-submit on load — the provider must tap Submit on the
          // Plan step. Auto-submitting here surprised users returning to fix
          // draft data and could re-run onboarding against stale state.
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert("Error", e instanceof Error ? e.message : "Could not load onboarding.");
        }
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialStep, focusUnmapped]);

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
      // Save once the user has made any meaningful progress — identity (name/email/
      // phone or a verified flag), team size, or business/address — so verification
      // state survives an app restart even before the business-details step.
      const hasProgress =
        formData.business_name ||
        formData.address?.line1 ||
        formData.owner_name?.trim() ||
        formData.owner_email?.trim() ||
        formData.owner_phone?.trim() ||
        formData.email_verified ||
        formData.phone_verified ||
        formData.team_size;
      if (hasProgress) {
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
    Keyboard.dismiss();
    if (editingFromReview && currentStep < REVIEW_STEP_ID) {
      setEditingFromReview(false);
      setCurrentStepState(REVIEW_STEP_ID);
      return;
    }
    const next = getNextStep(currentStep, formData);
    if (next !== null) setCurrentStepState(next);
  }, [currentStep, formData, editingFromReview]);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (editingFromReview && currentStep < REVIEW_STEP_ID) {
      // Back = cancel the edit — return to Review rather than the previous step.
      setEditingFromReview(false);
      setCurrentStepState(REVIEW_STEP_ID);
      return;
    }
    const prev = getPreviousStep(currentStep, formData);
    if (prev !== null) setCurrentStepState(prev);
    else router.back();
  }, [currentStep, formData, router, editingFromReview]);

  const skipForward = useCallback(() => {
    const meta = STEPS[currentStep - 1];
    if (!meta?.canSkip) return;
    Keyboard.dismiss();
    if (editingFromReview && currentStep < REVIEW_STEP_ID) {
      setEditingFromReview(false);
      setCurrentStepState(REVIEW_STEP_ID);
      return;
    }
    const next = getNextStep(currentStep, formData);
    if (next !== null) setCurrentStepState(next);
  }, [currentStep, formData, editingFromReview]);

  const continueToApp = useCallback(() => {
    router.replace("/(app)/(tabs)/dashboard" as never);
  }, [router]);

  const submit = useCallback(async () => {
    if (isSubmittingRef.current) return;

    if (providerProfileExists && currentStep === STEPS.length) {
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      try {
        const payload = buildSubmitPayload(formData);
        const res = await api.post<OnboardingCompletionData>(
          "/api/provider/onboarding",
          payload as Record<string, unknown>,
          { timeout: 120_000 },
        );
        const completionData =
          !res.error && res.data
            ? res.data
            : await resolveCheckoutFlagsForRecovery(formData);
        await finalizeOnboardingSuccess({
          data: completionData,
          formData,
          router,
          refreshProvider,
          userId: user?.id,
          showSuccessAlert: false,
          waitForCheckout: paystackCheckout.waitForCheckout,
        });
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Could not continue.");
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
      return;
    }

    for (let s = 1; s <= STEPS.length; s++) {
      if (!stepIsVisible(s, formData)) continue;
      const v = validateStep(s, formData);
      if (!v.valid) {
        Keyboard.dismiss();
        setCurrentStepState(s);
        Alert.alert("Almost there", v.errors[0] ?? "Complete this step first.");
        return;
      }
    }

    if (!formData.team_size) {
      Alert.alert("Missing info", "Please select your team size.");
      Keyboard.dismiss();
      setCurrentStepState(1);
      return;
    }
    if (!formData.phone_verified) {
      Alert.alert("Verify phone", "Please verify your phone number.");
      Keyboard.dismiss();
      setCurrentStepState(2);
      return;
    }
    if (!formData.global_category_ids?.length) {
      Alert.alert("Categories", "Select at least one category.");
      Keyboard.dismiss();
      setCurrentStepState(CATEGORIES_STEP_ID);
      return;
    }

    const payload = buildSubmitPayload(formData);
    const addr = payload.address as { line1?: string; city?: string; country?: string };
    if (!addr.line1 || !addr.city || !addr.country) {
      Alert.alert("Address", "Please complete address (line 1, city, country).");
      Keyboard.dismiss();
      setCurrentStepState(7);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await api.post<OnboardingCompletionData>(
        "/api/provider/onboarding",
        payload as Record<string, unknown>,
        { timeout: 120_000 },
      );

      if (res.error) {
        const errCode = (res.error as { code?: string }).code;
        const isTimeout = errCode === "TIMEOUT";
        const isAlreadyExists = errCode === "ALREADY_EXISTS";

        if (isTimeout || isAlreadyExists) {
          const profileExists = await probeProviderProfileExists();
          if (profileExists) {
            if (isAlreadyExists) {
              const retry = await api.post<OnboardingCompletionData>(
                "/api/provider/onboarding",
                payload as Record<string, unknown>,
                { timeout: 120_000 },
              );
              if (!retry.error && retry.data) {
                setProviderProfileExists(true);
                await finalizeOnboardingSuccess({
                  data: retry.data,
                  formData,
                  router,
                  refreshProvider,
                  userId: user?.id,
                  waitForCheckout: paystackCheckout.waitForCheckout,
                });
                return;
              }
            }
            const recoveryFlags = await resolveCheckoutFlagsForRecovery(formData);
            setProviderProfileExists(true);
            await finalizeOnboardingSuccess({
              data: recoveryFlags,
              formData,
              router,
              refreshProvider,
              userId: user?.id,
              waitForCheckout: paystackCheckout.waitForCheckout,
            });
            return;
          }
          if (isTimeout) {
            Alert.alert(
              "Still setting up",
              "Your business profile may still be saving. Wait a moment, then tap Submit again.",
            );
            return;
          }
        }

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

      setProviderProfileExists(true);
      await finalizeOnboardingSuccess({
        data: res.data,
        formData,
        router,
        refreshProvider,
        userId: user?.id,
        waitForCheckout: paystackCheckout.waitForCheckout,
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Submit failed.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [formData, refreshProvider, router, user?.id, providerProfileExists, currentStep]);

  const selectedPlanIsFree =
    formData.selected_plan_is_free ??
    (formData.selected_plan_name?.toLowerCase().includes("free") ?? false);

  const submitLabel =
    providerProfileExists && currentStep === STEPS.length
      ? "Continue to app"
      : currentStep === STEPS.length
        ? selectedPlanIsFree
          ? "Launch your business"
          : "Submit & launch"
        : editingFromReview && currentStep < REVIEW_STEP_ID
          ? "Back to review"
          : "Continue";

  const submitBusyLabel =
    currentStep === STEPS.length && selectedPlanIsFree
      ? "Launching your business…"
      : "Submitting…";

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
      editFromReview,
      editingFromReview,
      goNext,
      goBack,
      skipForward,
      isSubmitting,
      savingDraft,
      loadingDraft,
      providerProfileExists,
      continueToApp,
      submitLabel,
      submitBusyLabel,
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
      editFromReview,
      editingFromReview,
      goNext,
      goBack,
      skipForward,
      isSubmitting,
      savingDraft,
      loadingDraft,
      providerProfileExists,
      continueToApp,
      submitLabel,
      submitBusyLabel,
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
