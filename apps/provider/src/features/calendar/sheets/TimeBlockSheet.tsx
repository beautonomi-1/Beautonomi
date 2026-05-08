import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";

const BLOCK_TYPES = [
  { value: "break", label: "Break" },
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

export interface TimeBlockForm {
  block_type: string;
  title: string;
  start_time: string;
  end_time: string;
  staff_id: string;
  date: string;
}

interface Props {
  visible: boolean;
  initialForm: Partial<TimeBlockForm>;
  staffList: { id: string; name: string }[];
  onClose: () => void;
  onSave: (form: TimeBlockForm) => Promise<{ error: string | null }>;
}

export function TimeBlockSheet({ visible, initialForm, staffList, onClose, onSave }: Props) {
  const [form, setForm] = useState<TimeBlockForm>({
    block_type: initialForm.block_type ?? "break",
    title: initialForm.title ?? "",
    start_time: initialForm.start_time ?? "12:00",
    end_time: initialForm.end_time ?? "13:00",
    staff_id: initialForm.staff_id ?? staffList[0]?.id ?? "",
    date: initialForm.date ?? "",
  });
  const [loading, setLoading] = useState(false);

  const handleSave = useCallback(async () => {
    if (!form.date) {
      Alert.alert("Missing date", "Please provide a date for the time block.");
      return;
    }
    setLoading(true);
    try {
      const res = await onSave(form);
      if (res.error) Alert.alert("Error", res.error);
      else onClose();
    } finally {
      setLoading(false);
    }
  }, [form, onSave, onClose]);

  const field = (key: keyof TimeBlockForm, label: string, placeholder?: string) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600], marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={form[key] as string}
        onChangeText={(v) => setForm((p) => ({ ...p, [key]: v }))}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray[400]}
        style={{
          borderRadius: 8,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
          color: Colors.gray[900],
          backgroundColor: Colors.white,
        }}
      />
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Time Block" snapHeight="auto" showHandle>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600], marginBottom: 6 }}>
          Type
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {BLOCK_TYPES.map((bt) => (
            <TouchableOpacity
              key={bt.value}
              style={{
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: form.block_type === bt.value ? Colors.primary : Colors.gray[100],
              }}
              onPress={() => setForm((p) => ({ ...p, block_type: bt.value }))}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: form.block_type === bt.value ? Colors.white : Colors.gray[700],
                }}
              >
                {bt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {field("title", "Label (optional)", "e.g. Lunch break")}
        {field("date", "Date (YYYY-MM-DD)", "2026-05-08")}
        {field("start_time", "Start time", "09:00")}
        {field("end_time", "End time", "10:00")}

        {staffList.length > 1 && (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[600], marginBottom: 6 }}>
              Staff
            </Text>
            {staffList.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  marginBottom: 6,
                  backgroundColor: form.staff_id === s.id ? Colors.primaryLight : Colors.gray[50],
                  borderWidth: 1,
                  borderColor: form.staff_id === s.id ? Colors.primary : Colors.gray[200],
                }}
                onPress={() => setForm((p) => ({ ...p, staff_id: s.id }))}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: form.staff_id === s.id ? Colors.primary : Colors.gray[800] }}
                >
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={{
            borderRadius: 12,
            paddingVertical: 14,
            backgroundColor: Colors.primary,
            alignItems: "center",
            marginTop: 8,
          }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.white }}>Save Block</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  );
}
