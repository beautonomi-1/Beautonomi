import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/addresses");
      if (res.error) setError(res.error.message || "Failed to load");
      else setAddresses(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load} empty={{ title: "No saved addresses" }} isEmpty={addresses.length === 0}>
      {addresses.length > 0 && (
        <View className="gap-3">
          {addresses.map((a) => (
            <View key={a.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <Text className="font-medium text-gray-900">{a.label || "Address"}</Text>
              <Text className="text-gray-600 mt-1">{a.address_line1}</Text>
              {a.address_line2 && <Text className="text-gray-600">{a.address_line2}</Text>}
              <Text className="text-gray-600">{a.city}, {a.country}</Text>
              {a.is_default && (
                <View className="mt-2 bg-primary/20 self-start px-2 py-0.5 rounded">
                  <Text className="text-xs font-medium text-primary">Default</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScreenFrame>
  );
}
