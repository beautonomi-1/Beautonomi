import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { twStyle } from "@/lib/twStyle";

/** Ordered house-call stages, matching `bookings.current_stage`. */
const JOURNEY_STEPS = [
  { stage: "confirmed", label: "Confirmed" },
  { stage: "provider_on_way", label: "En route" },
  { stage: "provider_arrived", label: "Arrived" },
  { stage: "service_started", label: "In service" },
  { stage: "service_completed", label: "Done" },
] as const;

export type JourneyStage = (typeof JOURNEY_STEPS)[number]["stage"];

export type JourneyProgressProps = {
  stage: JourneyStage;
};

export function JourneyProgress({ stage }: JourneyProgressProps) {
  const activeIndex = Math.max(
    0,
    JOURNEY_STEPS.findIndex((step) => step.stage === stage),
  );

  return (
    <View
      style={twStyle("flex-row items-start mb-3")}
      accessibilityRole="progressbar"
      accessibilityLabel={`Journey progress: ${JOURNEY_STEPS[activeIndex].label}`}
    >
      {JOURNEY_STEPS.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        const reached = done || current;
        return (
          <View key={step.stage} style={twStyle("flex-1 items-center")}>
            <View style={twStyle("flex-row items-center w-full")}>
              <View
                style={[
                  twStyle("h-0.5 flex-1"),
                  { backgroundColor: index === 0 ? "transparent" : done || current ? Colors.primary : Colors.gray[200] },
                ]}
              />
              <View
                style={[
                  twStyle("h-5 w-5 rounded-full items-center justify-center"),
                  {
                    backgroundColor: reached ? Colors.primary : Colors.gray[100],
                    borderWidth: current ? 2 : 0,
                    borderColor: Colors.primaryRing,
                  },
                ]}
              >
                {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
              </View>
              <View
                style={[
                  twStyle("h-0.5 flex-1"),
                  {
                    backgroundColor:
                      index === JOURNEY_STEPS.length - 1 ? "transparent" : done ? Colors.primary : Colors.gray[200],
                  },
                ]}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[
                twStyle("mt-1 text-[10px]"),
                { color: reached ? Colors.gray[900] : Colors.gray[400], fontWeight: current ? "700" : "500" },
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
