import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { Colors, Shadows } from "@/constants/colors";
import { STEPS } from "./state";
import { useOnboardingWizard } from "./OnboardingWizardContext";
import { OnboardingStepBody } from "./WizardSteps";

/**
 * Named milestone ranges that appear as a segmented progress strip.
 * Steps outside a named milestone don't show a dedicated label.
 * visibleIndex is 1-based and counts only visible (non-conditional) steps.
 *
 * We map step IDs (absolute) to milestones — conditionally hidden steps
 * don't affect the milestone label once we know what is visible.
 */
type Milestone = { label: string; stepIds: number[] };

const MILESTONES: Milestone[] = [
  { label: "Profile",   stepIds: [1, 2, 3] },
  { label: "Business",  stepIds: [4, 5, 6] },
  { label: "Location",  stepIds: [7, 8, 9] },
  { label: "Services",  stepIds: [10, 11, 12] },
  { label: "Plan",      stepIds: [13, 14] },
];

function getMilestoneLabel(stepId: number): string {
  return MILESTONES.find((m) => m.stepIds.includes(stepId))?.label ?? "";
}

function getMilestoneProgress(stepId: number): number {
  const idx = MILESTONES.findIndex((m) => m.stepIds.includes(stepId));
  return idx + 1;
}

export function WizardChrome() {
  const insets = useSafeAreaInsets();
  const {
    goBack,
    goNext,
    skipForward,
    submit,
    currentStep,
    visibleIndex,
    visibleTotal,
    stepMeta,
    canSkipCurrent,
    isSubmitting,
    loadingDraft,
    savingDraft,
  } = useOnboardingWizard();

  if (loadingDraft) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title="Resuming setup" />
        <LoadingState message="Resuming your setup…" />
      </ScreenContainer>
    );
  }

  const isLast = currentStep === STEPS.length;
  const progressPct = Math.min(100, (visibleIndex / Math.max(visibleTotal, 1)) * 100);
  const milestoneLabel = getMilestoneLabel(currentStep);
  const milestoneProgress = getMilestoneProgress(currentStep);
  const milestoneCount = MILESTONES.length;

  return (
    <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false} keyboardAvoiding={false}>
      <ScreenHeader
        title={stepMeta?.title ?? "Setup"}
        showBack
        onBack={goBack}
        subtitle={stepMeta?.description}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
        style={twStyle("flex-1")}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {/* ── Progress zone ─────────────────────────────────────────────── */}
        <View style={twStyle("bg-white px-5 pb-4 pt-3")}>
          {/* Step counter + saved/saving status */}
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <View style={twStyle("flex-row items-center gap-2")}>
              {milestoneLabel ? (
                <View style={twStyle("rounded-full bg-primary/10 px-3 py-1")}>
                  <Text style={twStyle("text-[12px] font-bold uppercase tracking-wider text-primary")}>
                    {milestoneLabel}
                  </Text>
                </View>
              ) : null}
              <Text style={twStyle("text-[13px] font-semibold text-slate-500")}>
                Step {visibleIndex} of {visibleTotal}
              </Text>
            </View>
            <View
              style={twStyle(
                `flex-row items-center gap-1.5 rounded-full px-3 py-1 ${
                  savingDraft ? "bg-slate-50" : "bg-emerald-50"
                }`,
              )}
            >
              {savingDraft ? (
                <>
                  <ActivityIndicator size="small" color="#64748b" />
                  <Text style={twStyle("text-[12px] font-semibold text-slate-500")}>Saving</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-done-outline" size={14} color="#059669" />
                  <Text style={twStyle("text-[12px] font-semibold text-emerald-700")}>Saved</Text>
                </>
              )}
            </View>
          </View>

          {/* Segmented progress bar */}
          <View style={twStyle("flex-row gap-1.5")}>
            {MILESTONES.map((m, i) => {
              const done = milestoneProgress > i + 1;
              const active = milestoneProgress === i + 1;
              return (
                <View
                  key={m.label}
                  style={[
                    twStyle(`h-2 flex-1 overflow-hidden rounded-full`),
                    { backgroundColor: done || active ? "transparent" : "#f1f5f9" },
                  ]}
                >
                  {done ? (
                    <View style={twStyle("h-full w-full rounded-full bg-primary")} />
                  ) : active ? (
                    <View style={twStyle("h-full w-full overflow-hidden rounded-full bg-slate-200")}>
                      {/* Proportional fill within the active milestone */}
                      <View
                        style={[
                          twStyle("h-full rounded-full bg-primary"),
                          {
                            width: `${Math.min(100, progressPct * milestoneCount - i * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                  ) : (
                    <View style={twStyle("h-full w-full rounded-full bg-slate-200")} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Milestone name row */}
          <View style={twStyle("mt-2 flex-row")}>
            {MILESTONES.map((m, i) => {
              const done = milestoneProgress > i + 1;
              const active = milestoneProgress === i + 1;
              return (
                <View key={m.label} style={twStyle("flex-1 items-center")}>
                  <Text
                    style={twStyle(
                      `text-[12px] font-semibold ${active ? "text-slate-900" : done ? "text-emerald-700" : "text-slate-400"}`,
                    )}
                    numberOfLines={1}
                  >
                    {done ? "✓ " : ""}
                    {m.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Step content ──────────────────────────────────────────────── */}
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={[
            twStyle("px-5 pt-4"),
            { paddingBottom: 120 + Math.max(insets.bottom, 8) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepBody />
        </ScrollView>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <View
          style={[
            twStyle("absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white px-5 pt-4"),
            { paddingBottom: Math.max(insets.bottom, 12) + 12 },
          ]}
        >
          <View style={twStyle("flex-row gap-3")}>
            {canSkipCurrent && !isLast ? (
              <TouchableOpacity
                onPress={skipForward}
                style={twStyle(
                  "flex-1 rounded-full border-2 border-primary/20 bg-white py-4 items-center justify-center transition-all duration-300",
                )}
                accessibilityRole="button"
                accessibilityLabel="Skip this step"
              >
                <Text style={twStyle("text-[16px] font-semibold text-slate-600")}>Skip for now</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={isLast ? submit : goNext}
              disabled={isSubmitting}
              style={[
                twStyle(
                  `flex-row items-center justify-center gap-2 rounded-full py-4 transition-all duration-300 ${canSkipCurrent && !isLast ? "flex-1" : "flex-[2]"}`,
                ),
                { backgroundColor: Colors.primary, opacity: isSubmitting ? 0.7 : 1 },
                !isSubmitting ? Shadows.cardSmall : undefined,
              ]}
              accessibilityRole="button"
              accessibilityLabel={isLast ? "Submit setup" : "Next step"}
            >
              {isSubmitting ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={twStyle("text-[16px] font-semibold text-white")}>Submitting…</Text>
                </>
              ) : (
                <>
                  <Text style={twStyle("text-[16px] font-bold text-white")}>
                    {isLast ? "Submit & launch" : "Continue"}
                  </Text>
                  {!isLast ? <Ionicons name="arrow-forward" size={20} color="#fff" /> : null}
                  {isLast ? <Ionicons name="rocket-outline" size={20} color="#fff" /> : null}
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
