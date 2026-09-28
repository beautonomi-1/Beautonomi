import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { twStyle } from "@/lib/twStyle";

/** Ordered house-call stages, matching `bookings.current_stage`. */
const JOURNEY_STEPS = [
  { stage: "confirmed", labelKey: "stageConfirmed" },
  { stage: "provider_on_way", labelKey: "stageEnRoute" },
  { stage: "provider_arrived", labelKey: "stageArrived" },
  { stage: "service_started", labelKey: "stageInService" },
  { stage: "service_completed", labelKey: "stageDone" },
] as const;

export type JourneyStage = (typeof JOURNEY_STEPS)[number]["stage"];

export type JourneyProgressProps = {
  stage: JourneyStage;
  /** Compact segmented bar + single current-stage line (sticky header). */
  variant?: "full" | "compact";
  /** Adds bottom border / padding for fixed chrome above scroll content. */
  sticky?: boolean;
  /** Override container accessibility label (e.g. translated section title). */
  accessibilitySectionLabel?: string;
};

const JP_PREFIX = "provider.mobile.components.journeyProgress";

export function JourneyProgress({
  stage,
  variant = "full",
  sticky = false,
  accessibilitySectionLabel,
}: JourneyProgressProps) {
  const { t } = useTranslation();
  const jp = (key: string, opts?: Record<string, string | number>) =>
    t(`${JP_PREFIX}.${key}`, opts ?? {}) as string;

  const activeIndex = Math.max(
    0,
    JOURNEY_STEPS.findIndex((step) => step.stage === stage),
  );
  const currentStep = JOURNEY_STEPS[activeIndex];
  const currentLabel = jp(currentStep.labelKey);
  const total = JOURNEY_STEPS.length;

  const a11yLabel =
    accessibilitySectionLabel ??
    jp("progressA11y", { stage: currentLabel });

  if (variant === "compact") {
    return (
      <View
        style={[
          twStyle("px-4 py-2.5 bg-white"),
          sticky ? twStyle("border-b border-gray-200") : null,
        ]}
        accessibilityRole="progressbar"
        accessibilityLabel={a11yLabel}
        accessibilityValue={{ text: jp("currentStageSummary", { stage: currentLabel, current: activeIndex + 1, total }) }}
      >
        <View style={twStyle("flex-row gap-1 mb-1.5")}>
          {JOURNEY_STEPS.map((step, index) => {
            const reached = index <= activeIndex;
            return (
              <View
                key={step.stage}
                style={[
                  twStyle("h-2 flex-1 rounded-full overflow-hidden"),
                  { backgroundColor: reached ? Colors.primary : Colors.gray[200] },
                ]}
              />
            );
          })}
        </View>
        <Text style={twStyle("text-xs font-semibold text-gray-700")} numberOfLines={1}>
          {jp("currentStageSummary", { stage: currentLabel, current: activeIndex + 1, total })}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={twStyle("flex-row items-start mb-3")}
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
    >
      {JOURNEY_STEPS.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        const reached = done || current;
        const label = jp(step.labelKey);
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
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
