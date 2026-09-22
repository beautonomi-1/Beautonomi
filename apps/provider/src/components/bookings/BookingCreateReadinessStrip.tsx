import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import type { CreateReadinessSummary } from "@beautonomi/provider-booking";
import { twStyle } from "@/lib/twStyle";

type Props = {
  summary: CreateReadinessSummary;
  onJumpToSection: (sectionKey: string, participantIndex?: number) => void;
  /** Stable ids for checklist row labels (group_* / booking_*). */
  itemLabel?: (itemId: string) => string;
  forceExpanded?: boolean;
};

const DEFAULT_LABELS: Record<string, string> = {
  group_date: "Date",
  group_time: "Time slot",
  group_duration: "Duration",
  group_service: "Default service",
  group_staff: "Team member",
  group_address: "At-home address",
  group_participants: "Participants",
  booking_client: "Client",
  booking_services: "Services or products",
  booking_schedule: "Date & time",
  booking_staff: "Staff assignment",
  booking_location: "Service address",
  booking_intake: "Client forms",
  booking_recurring: "Repeating series",
};

function participantLabel(id: string): string | null {
  const m = /^group_participant_(\d+)$/.exec(id);
  if (!m) return null;
  return `Participant ${Number(m[1]) + 1}`;
}

export function BookingCreateReadinessStrip({
  summary,
  onJumpToSection,
  itemLabel,
  forceExpanded = false,
}: Props) {
  const { t } = useTranslation();
  const rc = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.components.bookingCreateReadiness.${key}`, opts) as string,
    [t],
  );
  const [expanded, setExpanded] = useState(false);
  const showList = expanded || forceExpanded;
  const { completed, total, percent, nextItem } = summary;

  if (total === 0) return null;

  const labelFor = (id: string) => {
    const custom = itemLabel?.(id);
    if (custom) return custom;
    const part = participantLabel(id);
    if (part) return part;
    const key = id.replace(/_/g, "");
    const fromI18n = t(`provider.mobile.components.bookingCreateReadiness.items.${id}`, {
      defaultValue: "",
    }) as string;
    if (fromI18n) return fromI18n;
    return DEFAULT_LABELS[id] ?? id;
  };

  const nextLabel = nextItem ? labelFor(nextItem.id) : null;

  return (
    <View
      style={twStyle("mb-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-3 py-2.5")}
      accessibilityRole="summary"
      accessibilityLabel={rc("a11ySummary", { completed, total })}
    >
      <View style={twStyle("mb-2 flex-row items-center justify-between")}>
        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-indigo-900")}>
          {rc("title", { completed, total })}
        </Text>
        <Text style={twStyle("text-xs font-bold text-indigo-700")}>{percent}%</Text>
      </View>
      <View
        style={twStyle("mb-2 h-1.5 overflow-hidden rounded-full bg-indigo-100")}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: completed }}
      >
        <View style={{ width: `${percent}%`, height: "100%", backgroundColor: "#4f46e5" }} />
      </View>
      {nextLabel && !showList ? (
        <TouchableOpacity
          onPress={() => {
            const idx =
              nextItem?.id.startsWith("group_participant_") ?
                Number(nextItem.id.replace("group_participant_", ""))
              : undefined;
            onJumpToSection(nextItem!.sectionKey, idx);
          }}
          style={twStyle("flex-row items-center")}
          accessibilityRole="button"
          accessibilityHint={rc("jumpHint")}
        >
          <Ionicons name="arrow-down-circle-outline" size={16} color="#4338ca" />
          <Text style={twStyle("ms-1.5 flex-1 text-sm font-medium text-indigo-900")}>
            {rc("next", { label: nextLabel })}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        style={twStyle("mt-1 flex-row items-center self-start")}
        accessibilityRole="button"
        accessibilityState={{ expanded: showList }}
      >
        <Text style={twStyle("text-xs font-semibold text-indigo-700")}>
          {showList ? rc("hideRequirements") : rc("showRequirements")}
        </Text>
        <Ionicons
          name={showList ? "chevron-up" : "chevron-down"}
          size={14}
          color="#4338ca"
          style={{ marginStart: 4 }}
        />
      </TouchableOpacity>
      {showList ?
        <View style={twStyle("mt-2 border-t border-indigo-100 pt-2")}>
          {summary.items
            .filter((i) => i.required)
            .map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  if (item.done) return;
                  const idx =
                    item.id.startsWith("group_participant_") ?
                      Number(item.id.replace("group_participant_", ""))
                    : undefined;
                  onJumpToSection(item.sectionKey, idx);
                }}
                style={twStyle("mb-1 flex-row items-center py-0.5")}
                disabled={item.done}
                accessibilityRole="button"
              >
                <Ionicons
                  name={item.done ? "checkmark-circle" : "ellipse-outline"}
                  size={14}
                  color={item.done ? "#16a34a" : "#6366f1"}
                />
                <Text
                  style={twStyle(
                    `ms-1.5 flex-1 text-xs ${item.done ? "text-gray-500 line-through" : "text-indigo-950"}`,
                  )}
                >
                  {labelFor(item.id)}
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      : null}
    </View>
  );
}
