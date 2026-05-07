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
import { useTranslation } from "@beautonomi/i18n";

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
  decreaseA11y,
  increaseA11y,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  decreaseA11y?: string;
  increaseA11y?: string;
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
          accessibilityLabel={decreaseA11y ?? `Decrease ${label}`}
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
          accessibilityLabel={increaseA11y ?? `Increase ${label}`}
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
  const { t } = useTranslation();
  const p = "provider.calendarScreen.preferencesModal" as const;
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
                {t(`${p}.title`)}
              </Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                {t(`${p}.subtitle`)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t(`${p}.closeA11y`)}
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
            <TouchableOpacity
              style={twStyle("mt-4 mb-2 items-center rounded-xl bg-indigo-600 py-3")}
              onPress={() => {
                onClose();
                // Navigate to settings route
                import("expo-router").then(({ router }) => {
                  router.push("/(app)/(tabs)/more/settings/calendar-preferences");
                });
              }}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-sm font-semibold text-white")}>
                {t("provider.calendarScreen.fullCalendarBrowser")}
              </Text>
            </TouchableOpacity>

            {/* ──────────── DISPLAY ──────────── */}
            <SectionHeader title={t(`${p}.displaySection`)} icon="eye-outline" />

            <ToggleRow
              label={t(`${p}.highContrast`)}
              description={t(`${p}.highContrastDesc`)}
              value={preferences.highContrast}
              onToggle={(v) => onUpdate("highContrast", v)}
            />

            <ToggleRow
              label={t(`${p}.showCanceled`)}
              description={t(`${p}.showCanceledDesc`)}
              value={preferences.showCanceled}
              onToggle={(v) => onUpdate("showCanceled", v)}
            />

            <ToggleRow
              label={t(`${p}.compactMode`)}
              description={t(`${p}.compactModeDesc`)}
              value={preferences.compactMode}
              onToggle={(v) => onUpdate("compactMode", v)}
            />

            <ToggleRow
              label={t(`${p}.appointmentIcons`)}
              description={t(`${p}.appointmentIconsDesc`)}
              value={preferences.showAppointmentIcons}
              onToggle={(v) => onUpdate("showAppointmentIcons", v)}
            />

            <ToggleRow
              label={t(`${p}.showPrices`)}
              description={t(`${p}.showPricesDesc`)}
              value={preferences.showPrices}
              onToggle={(v) => onUpdate("showPrices", v)}
            />

            <ToggleRow
              label={t(`${p}.showClientPhone`)}
              description={t(`${p}.showClientPhoneDesc`)}
              value={preferences.showClientPhone}
              onToggle={(v) => onUpdate("showClientPhone", v)}
            />

            {/* ──────────── COLORS ──────────── */}
            <SectionHeader title={t(`${p}.colorsSection`)} icon="color-palette-outline" />

            <PillSelector<ColorByMode>
              label={t(`${p}.colorBy`)}
              description={t(`${p}.colorByDesc`)}
              options={[
                { label: t(`${p}.colorByStatus`), value: "status" },
                { label: t(`${p}.colorByService`), value: "service" },
                { label: t(`${p}.colorByTeam`), value: "team_member" },
              ]}
              value={preferences.colorBy}
              onChange={(v) => onUpdate("colorBy", v)}
            />

            {/* ──────────── TIME GRID ──────────── */}
            <SectionHeader title={t(`${p}.timeGridSection`)} icon="time-outline" />

            <PillSelector<TimeIncrement>
              label={t(`${p}.timeIncrement`)}
              description={t(`${p}.timeIncrementDesc`)}
              options={[
                { label: t(`${p}.min5`), value: 5 },
                { label: t(`${p}.min10`), value: 10 },
                { label: t(`${p}.min15`), value: 15 },
              ]}
              value={preferences.timeIncrementMinutes}
              onChange={(v) => onUpdate("timeIncrementMinutes", v)}
            />

            <ToggleRow
              label={t(`${p}.scrollToNow`)}
              description={t(`${p}.scrollToNowDesc`)}
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
                  ? t(`${p}.advancedToggleHide`)
                  : t(`${p}.advancedToggleShow`)
              }
            >
              <View style={twStyle("flex-row items-center")}>
                <Ionicons name="settings-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ml-2 text-sm font-semibold text-gray-700")}>
                  {t(`${p}.advancedHeading`)}
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
                  label={t(`${p}.workdayStart`)}
                  description={t(`${p}.workdayStartDesc`)}
                  value={preferences.workdayStartHour}
                  onChange={(v) => onUpdate("workdayStartHour", v)}
                  min={0}
                  max={preferences.workdayEndHour - 1}
                  suffix=":00"
                  decreaseA11y={t(`${p}.decreaseA11y`, { label: t(`${p}.workdayStart`) })}
                  increaseA11y={t(`${p}.increaseA11y`, { label: t(`${p}.workdayStart`) })}
                />

                <NumberStepper
                  label={t(`${p}.workdayEnd`)}
                  description={t(`${p}.workdayEndDesc`)}
                  value={preferences.workdayEndHour}
                  onChange={(v) => onUpdate("workdayEndHour", v)}
                  min={preferences.workdayStartHour + 1}
                  max={23}
                  suffix=":00"
                  decreaseA11y={t(`${p}.decreaseA11y`, { label: t(`${p}.workdayEnd`) })}
                  increaseA11y={t(`${p}.increaseA11y`, { label: t(`${p}.workdayEnd`) })}
                />

                <ToggleRow
                  label={t(`${p}.processingBuffer`)}
                  description={t(`${p}.processingBufferDesc`)}
                  value={preferences.showProcessingAndBuffer}
                  onToggle={(v) => onUpdate("showProcessingAndBuffer", v)}
                />

                <PillSelector<DefaultAppointmentStatus>
                  label={t(`${p}.defaultNewStatus`)}
                  description={t(`${p}.defaultNewStatusDesc`)}
                  options={[
                    { label: t(`${p}.statusConfirmed`), value: "confirmed" },
                    { label: t(`${p}.statusUnconfirmed`), value: "unconfirmed" },
                  ]}
                  value={preferences.defaultNewAppointmentStatus}
                  onChange={(v) =>
                    onUpdate("defaultNewAppointmentStatus", v)
                  }
                />

                <ToggleRow
                  label={t(`${p}.processingFreesProvider`)}
                  description={t(`${p}.processingFreesProviderDesc`)}
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
              accessibilityLabel={t(`${p}.resetA11y`)}
            >
              <Text style={twStyle("text-sm font-semibold text-red-600")}>
                {t(`${p}.reset`)}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
