import { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function ContactSupportScreen() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { execute: createTicket, loading: submitting } = useApiMutation("post");

  const handleSubmit = async () => {
    const sub = subject.trim();
    const msg = message.trim();
    if (!sub || !msg) {
      Alert.alert("Missing fields", "Please enter a subject and message.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await createTicket("/api/me/support-tickets", {
      subject: sub,
      message: msg,
      priority: "medium",
    });
    if (!res.error) {
      setSubject("");
      setMessage("");
      Alert.alert("Ticket sent", "Your support ticket has been created. We'll get back to you soon.", [
        { text: "View tickets", onPress: () => router.push("/(app)/(tabs)/more/support-tickets" as never) },
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Alert.alert("Could not send", res.error ?? "Please try again.");
    }
  };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Contact support" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-2 pt-4">
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(app)/(tabs)/more/support-tickets" as never);
            }}
            className="flex-row items-center rounded-xl border border-gray-200 bg-white p-4 mb-6"
            activeOpacity={0.7}
            accessibilityLabel="My support tickets. View and reply to your tickets."
            accessibilityRole="button"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
              <Ionicons name="chatbubbles-outline" size={22} color="#4f46e5" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="font-semibold text-gray-900">My support tickets</Text>
              <Text className="text-sm text-gray-500">View and reply to your tickets</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>

          <Text className="text-sm font-medium text-gray-700 mb-2">Submit a new ticket</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor="#9ca3af"
            className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
            accessibilityLabel="Ticket subject"
            accessibilityRole="none"
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your issue or question..."
            placeholderTextColor="#9ca3af"
            className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 min-h-[120px]"
            multiline
            textAlignVertical="top"
            accessibilityLabel="Ticket message"
            accessibilityRole="none"
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || !subject.trim() || !message.trim()}
            className="rounded-xl bg-gray-900 py-3 items-center"
            activeOpacity={0.8}
            accessibilityLabel={submitting ? "Sending ticket" : "Send support ticket"}
            accessibilityRole="button"
          >
            <Text className="font-medium text-white">
              {submitting ? "Sending…" : "Send ticket"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
