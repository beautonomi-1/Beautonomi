import { CalendarPreferencesModal } from "@/components/calendar/CalendarPreferencesModal";
import { useCalendarPreferences } from "@/hooks/useCalendarPreferences";

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Wraps the existing CalendarPreferencesModal as a feature-calendar sheet. */
export function CalendarPreferencesSheet({ visible, onClose }: Props) {
  const { preferences, updatePreference, resetToDefaults } = useCalendarPreferences();
  return (
    <CalendarPreferencesModal
      visible={visible}
      onClose={onClose}
      preferences={preferences}
      onUpdate={updatePreference}
      onReset={resetToDefaults}
    />
  );
}
