import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { CalendarTypography } from "@/features/calendar/theme/typography";
import { WIZARD_STEPS } from "@/features/calendar/policies/wizardSteps.policy";
import type { WizardModeV2, WizardStepIdV2 } from "@/features/calendar/types/wizard";

interface Props {
  visible: boolean;
  mode: WizardModeV2 | null;
  onClose: () => void;
  onComplete: () => void;
}

export function CalendarBookingWizard({ visible, mode, onClose, onComplete }: Props) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = mode ? WIZARD_STEPS[mode] : [];
  const currentStep: WizardStepIdV2 | undefined = steps[currentStepIndex];

  const handleNext = useCallback(() => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      onComplete();
    }
  }, [currentStepIndex, steps.length, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    } else {
      onClose();
    }
  }, [currentStepIndex, onClose]);

  if (!visible || !mode || !currentStep) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
          <TouchableOpacity onPress={handleBack} style={{ padding: 8, marginLeft: -8 }}>
            <Ionicons name={currentStepIndex === 0 ? "close" : "arrow-back"} size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: "center", ...CalendarTypography.cardName }}>
            {mode === "block" ? "New Time Block" : "New Booking"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Step Indicator */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, gap: 4 }}>
          {steps.map((step: WizardStepIdV2, index: number) => (
            <View
              key={step}
              style={{
                flex: 1,
                height: 4,
                backgroundColor: index <= currentStepIndex ? Colors.primary : Colors.gray[200],
                borderRadius: 2,
              }}
            />
          ))}
        </View>

        {/* Content Area (Placeholder for actual step forms) */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
          <Text style={CalendarTypography.heroDate}>
            Step: {currentStep}
          </Text>
          <Text style={{ ...CalendarTypography.heroMeta, marginTop: 8 }}>
            This is where the {currentStep} form components are rendered.
          </Text>
        </ScrollView>

        {/* Footer Actions */}
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: Colors.gray[100] }}>
          <TouchableOpacity
            onPress={handleNext}
            style={{
              backgroundColor: Colors.primary,
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: Colors.white, fontSize: 16, fontWeight: "600" }}>
              {currentStepIndex === steps.length - 1 ? "Complete" : "Continue"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
