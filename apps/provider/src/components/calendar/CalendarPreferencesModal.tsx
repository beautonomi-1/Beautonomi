import React, { useState } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  CalendarPreferences,
  ColorByMode,
  TimeIncrement,
  DefaultAppointmentStatus,
} from "@/hooks/useCalendarPreferences";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";

/* ================================================================== */
/*  Props                                                              */
/* ================================================================== */

interface Props {
  visible: boolean;
  onClose: () => void;
  preferences: CalendarPreferences;
  onUpdate: <K extends keyof CalendarPreferences>(
    key: K,
    value: CalendarPreferences[K],
  ) => void;
  onReset: () => void;
}

/* ================================================================== */
/*  Section header                                                     */
/* ================================================================== */

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={twStyle("mb-2 mt-5 flex-row items-center")}>
      <Ionicons
        name={icon as keyof typeof Ionicons.glyphMap}
        size={16}
        color="#6366f1"
      />
      <Text style={twStyle("ml-2 text-xs font-bold uppercase tracking-wider text-gray-400")}>
        {title}
      </Text>
    </View>
  );
}

/* ================================================================== */
/*  Toggle row                                                         */
/* ================================================================== */

function ToggleRow({
  label,
  description,
  value,
  onToggle,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-3")}>
      <View style={twStyle("mr-4 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-900")}>{label}</Text>
        {description && (
          <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#d1d5db", true: "#818cf8" }}
        thumbColor={value ? "#4f46e5" : "#f9fafb"}
        accessibilityLabel={label}
        accessibilityRole="switch"
      />
    </View>
  );
}

/* ================================================================== */
/*  Pill selector                                                      */
/* ================================================================== */

function PillSelector<T extends string | number>({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={twStyle("border-b border-gray-50 py-3")}>
      <Text style={twStyle("text-sm font-medium text-gray-900")}>{label}</Text>
      {description && (
        <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{description}</Text>
      )}
      <View style={twStyle("mt-2 flex-row flex-wrap")}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[twStyle(`rounded-full px-4 py-2 ${selected ? "bg-indigo-600" : "bg-gray-100"}`), { marginRight: 8, marginBottom: 8 }]}
              onPress={() => onChange(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.label}
            >
              <Text
                style={twStyle(`text-xs font-semibold ${selected ? "text-white" : "text-gray-700"}`)}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ================================================================== */
/*  Number stepper                                                     */
/* ================================================================== */

function NumberStepper({
  label,
  description,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-3")}>
      <View style={twStyle("mr-4 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-900")}>{label}</Text>
        {description && (
          <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{description}</Text>
        )}
      </View>
      <View style={twStyle("flex-row items-center rounded-xl bg-gray-100")}>
        <TouchableOpacity
          style={twStyle("px-3 py-2")}
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
        >
          <Ionicons
            name="remove"
            size={16}
            color={value <= min ? "#d1d5db" : "#111"}
          />
        </TouchableOpacity>
        <Text style={twStyle("min-w-[40px] text-center text-sm font-bold text-gray-900")}>
          {value}
          {suffix ?? ""}
        </Text>
        <TouchableOpacity
          style={twStyle("px-3 py-2")}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
        >
          <Ionicons
            name="add"
            size={16}
            color={value >= max ? "#d1d5db" : "#111"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ================================================================== */
/*  Main modal                                                         */
/* ================================================================== */

export function CalendarPreferencesModal({
  visible,
  onClose,
  preferences,
  onUpdate,
  onReset,
}: Props) {
  const { screenPadding } = useResponsive();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={twStyle("flex-1 bg-black/40")}>
        {/* Backdrop */}
        <Pressable style={twStyle("flex-[0.15]")} onPress={onClose} />

        {/* Panel */}
        <View style={twStyle("flex-[0.85] rounded-t-3xl bg-white")}>
          {/* Handle */}
          <View style={twStyle("items-center pb-1 pt-3")}>
            <View style={twStyle("h-1 w-10 rounded-full bg-gray-300")} />
          </View>

          {/* Header */}
          <View style={twStyle("flex-row items-center justify-between border-b border-gray-100 px-5 pb-3")}>
            <View>
              <Text style={twStyle("text-lg font-bold text-gray-900")}>
                Calendar Preferences
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                Customize how your calendar looks and behaves
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close preferences"
            >
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={twStyle("flex-1")}
            contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ──────────── DISPLAY ──────────── */}
            <SectionHeader title="Display" icon="eye-outline" />

            <ToggleRow
              label="High Contrast"
              description="Increase contrast for better visibility"
              value={preferences.highContrast}
              onToggle={(v) => onUpdate("highContrast", v)}
            />

            <ToggleRow
              label="Show Canceled"
              description="Display canceled appointments on the grid"
              value={preferences.showCanceled}
              onToggle={(v) => onUpdate("showCanceled", v)}
            />

            <ToggleRow
              label="Compact Mode"
              description="Reduce appointment block height for a denser view"
              value={preferences.compactMode}
              onToggle={(v) => onUpdate("compactMode", v)}
            />

            <ToggleRow
              label="Appointment Icons"
              description="Show icons for new client, notes, etc."
              value={preferences.showAppointmentIcons}
              onToggle={(v) => onUpdate("showAppointmentIcons", v)}
            />

            <ToggleRow
              label="Show Prices"
              description="Display service prices on appointment blocks"
              value={preferences.showPrices}
              onToggle={(v) => onUpdate("showPrices", v)}
            />

            <ToggleRow
              label="Show Client Phone"
              description="Display client phone number on appointment details"
              value={preferences.showClientPhone}
              onToggle={(v) => onUpdate("showClientPhone", v)}
            />

            {/* ──────────── COLORS ──────────── */}
            <SectionHeader title="Colors" icon="color-palette-outline" />

            <PillSelector<ColorByMode>
              label="Color By"
              description="How appointment blocks are colored"
              options={[
                { label: "Status", value: "status" },
                { label: "Service", value: "service" },
                { label: "Team Member", value: "team_member" },
              ]}
              value={preferences.colorBy}
              onChange={(v) => onUpdate("colorBy", v)}
            />

            {/* ──────────── TIME GRID ──────────── */}
            <SectionHeader title="Time Grid" icon="time-outline" />

            <PillSelector<TimeIncrement>
              label="Time Increment"
              description="Grid slot size in minutes"
              options={[
                { label: "5 min", value: 5 },
                { label: "10 min", value: 10 },
                { label: "15 min", value: 15 },
              ]}
              value={preferences.timeIncrementMinutes}
              onChange={(v) => onUpdate("timeIncrementMinutes", v)}
            />

            <ToggleRow
              label="Scroll to Now"
              description="Auto-scroll to current time when opening calendar"
              value={preferences.scrollToNow}
              onToggle={(v) => onUpdate("scrollToNow", v)}
            />

            {/* ──────────── ADVANCED ──────────── */}
            <TouchableOpacity
              style={twStyle("mt-5 flex-row items-center justify-between rounded-xl bg-gray-50 px-4 py-3")}
              onPress={() => setShowAdvanced(!showAdvanced)}
              accessibilityRole="button"
              accessibilityLabel={
                showAdvanced
                  ? "Hide advanced settings"
                  : "Show advanced settings"
              }
            >
              <View style={twStyle("flex-row items-center")}>
                <Ionicons name="settings-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ml-2 text-sm font-semibold text-gray-700")}>
                  Advanced Settings
                </Text>
              </View>
              <Ionicons
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={18}
                color="#9ca3af"
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={twStyle("mt-2")}>
                <NumberStepper
                  label="Workday Start"
                  description="Hour the calendar grid begins"
                  value={preferences.workdayStartHour}
                  onChange={(v) => onUpdate("workdayStartHour", v)}
                  min={0}
                  max={preferences.workdayEndHour - 1}
                  suffix=":00"
                />

                <NumberStepper
                  label="Workday End"
                  description="Hour the calendar grid ends"
                  value={preferences.workdayEndHour}
                  onChange={(v) => onUpdate("workdayEndHour", v)}
                  min={preferences.workdayStartHour + 1}
                  max={23}
                  suffix=":00"
                />

                <ToggleRow
                  label="Processing & Buffer"
                  description="Show processing and buffer time segments on blocks"
                  value={preferences.showProcessingAndBuffer}
                  onToggle={(v) => onUpdate("showProcessingAndBuffer", v)}
                />

                <PillSelector<DefaultAppointmentStatus>
                  label="Default New Status"
                  description="Status assigned to new appointments"
                  options={[
                    { label: "Confirmed", value: "confirmed" },
                    { label: "Unconfirmed", value: "unconfirmed" },
                  ]}
                  value={preferences.defaultNewAppointmentStatus}
                  onChange={(v) =>
                    onUpdate("defaultNewAppointmentStatus", v)
                  }
                />

                <ToggleRow
                  label="Processing Frees Provider"
                  description="Provider can accept other bookings during processing time"
                  value={preferences.processingFreesProvider}
                  onToggle={(v) => onUpdate("processingFreesProvider", v)}
                />
              </View>
            )}

            {/* ──────────── Reset ──────────── */}
            <TouchableOpacity
              style={twStyle("mt-6 items-center rounded-xl border border-red-200 bg-red-50 py-3")}
              onPress={onReset}
              accessibilityRole="button"
              accessibilityLabel="Reset all preferences to defaults"
            >
              <Text style={twStyle("text-sm font-semibold text-red-600")}>
                Reset to Defaults
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
