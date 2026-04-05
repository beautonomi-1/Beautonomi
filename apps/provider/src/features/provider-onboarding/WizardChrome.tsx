import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { Colors, Shadows } from "@/constants/colors";
import { STEPS } from "./state";
import { useOnboardingWizard } from "./OnboardingWizardContext";
import { OnboardingStepBody } from "./WizardSteps";

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
      <ScreenContainer scrollable={false} reserveTabBarSpace={false}>
        <View style={twStyle("flex-1 items-center justify-center py-16")}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={twStyle("mt-4 text-base text-gray-600")}>Loading your progress…</Text>
        </View>
      </ScreenContainer>
    );
  }

  const isLast = currentStep === STEPS.length;

  return (
    <ScreenContainer scrollable={false} reserveTabBarSpace={false}>
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
        <View style={twStyle("px-4 pt-2")}>
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <Text style={twStyle("text-xs font-semibold uppercase text-gray-500")}>
              Step {visibleIndex} of {visibleTotal}
            </Text>
            {savingDraft ? (
              <Text style={twStyle("text-xs text-gray-500")}>Saving…</Text>
            ) : null}
          </View>
          <View style={twStyle("h-2 w-full overflow-hidden rounded-full bg-gray-200")}>
            <View
              style={[
                twStyle("h-full rounded-full bg-primary"),
                { width: `${Math.min(100, (visibleIndex / Math.max(visibleTotal, 1)) * 100)}%` },
              ]}
            />
          </View>
        </View>

        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={[
            twStyle("px-4 pt-4"),
            { paddingBottom: 120 + Math.max(insets.bottom, 8) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepBody />
        </ScrollView>

        <View
          style={[
            twStyle("absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white px-4 pt-3"),
            { paddingBottom: Math.max(insets.bottom, 12) + 14 },
          ]}
        >
          <View style={twStyle("flex-row gap-3")}>
            {canSkipCurrent && !isLast ? (
              <TouchableOpacity
                onPress={skipForward}
                style={twStyle("flex-1 rounded-2xl border border-gray-300 bg-white py-3.5 items-center")}
                accessibilityRole="button"
                accessibilityLabel="Skip this step"
              >
                <Text style={twStyle("font-semibold text-gray-800")}>Skip</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={isLast ? submit : goNext}
              disabled={isSubmitting}
              style={[
                twStyle(
                  `flex-1 rounded-2xl py-3.5 items-center ${canSkipCurrent && !isLast ? "" : "flex-[2]"}`,
                ),
                { backgroundColor: Colors.primary, opacity: isSubmitting ? 0.7 : 1 },
                !isSubmitting ? Shadows.cardSmall : undefined,
              ]}
              accessibilityRole="button"
              accessibilityLabel={isLast ? "Submit setup" : "Next step"}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={twStyle("font-semibold text-white")}>{isLast ? "Submit" : "Next"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
