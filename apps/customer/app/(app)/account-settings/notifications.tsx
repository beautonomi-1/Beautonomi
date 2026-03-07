import { useEffect, useState } from "react";
import { View, Text, Switch } from "react-native";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/notification-preferences");
      if (res.error) setError(res.error.message || "Failed to load");
      else setPrefs(res.data ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (key: string, value: boolean) => {
    setSaving(true);
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      const res = await api.patch<any>("/api/me/notification-preferences", next);
      if (res.error) {
        setPrefs(prefs);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100] }}>
          <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>Email notifications</Text>
          <Switch
            value={prefs.email_notifications !== false}
            onValueChange={(v) => toggle("email_notifications", v)}
            trackColor={{ false: Colors.gray[300], true: Colors.primary }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], marginTop: 16 }}>
          <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>SMS notifications</Text>
          <Switch
            value={prefs.sms_notifications === true}
            onValueChange={(v) => toggle("sms_notifications", v)}
            trackColor={{ false: Colors.gray[300], true: Colors.primary }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], marginTop: 16 }}>
          <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>Booking reminders</Text>
          <Switch
            value={prefs.booking_reminders !== false}
            onValueChange={(v) => toggle("booking_reminders", v)}
            trackColor={{ false: Colors.gray[300], true: Colors.primary }}
          />
        </View>
      </View>
    </ScreenFrame>
  );
}
