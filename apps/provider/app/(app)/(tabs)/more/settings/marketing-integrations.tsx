/**
 * Native Marketing integrations — connect marketing tools (in-app screen).
 *
 * §Provider-launch (audit 2026-04): previously this screen was a static
 * "More options coming soon" placeholder. Web already exposes the Email
 * (SendGrid/Mailchimp) and Twilio SMS/WhatsApp integrations pages. These
 * are infrequent one-time setup flows that the web is canonical for, so
 * we list both cards natively and open the configured web route in the
 * in-app browser, matching the calendar-integration pattern elsewhere in
 * the provider app. If APP_URL is missing we surface a clear config
 * error instead of silently dead-ending.
 */
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { APP_URL } from "@/config/public-env";

type Integration = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Web path opened in the in-app browser. */
  path: string;
};

const INTEGRATIONS: Integration[] = [
  {
    id: "email",
    title: "Email (SendGrid / Mailchimp)",
    description: "Send transactional and marketing email to your clients.",
    icon: "mail-outline",
    path: "/provider/settings/integrations/email",
  },
  {
    id: "twilio",
    title: "SMS & WhatsApp (Twilio)",
    description: "Send SMS and WhatsApp reminders, confirmations, and campaigns.",
    icon: "chatbubbles-outline",
    path: "/provider/settings/integrations/twilio",
  },
];

export default function MarketingIntegrationsScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();

  const openIntegration = async (item: Integration) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!APP_URL) {
      Alert.alert(
        "Setup unavailable",
        "Marketing integrations are configured in your web dashboard, but the app can't reach it. Please sign in at your Beautonomi dashboard on the web."
      );
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(`${APP_URL}${item.path}`, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (e) {
      Alert.alert(
        "Couldn't open",
        e instanceof Error ? e.message : "We couldn't open the integration setup. Please try again."
      );
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Marketing integrations"
        subtitle="Connect marketing tools"
        onBack={() => router.back()}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingTop: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 mb-4")}>
          <Text style={twStyle("text-sm text-gray-700")}>
            Connect third-party services to send email, SMS, and WhatsApp to your clients. Setup runs
            in your secure Beautonomi dashboard and syncs back to the app automatically.
          </Text>
        </View>

        {INTEGRATIONS.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => openIntegration(item)}
            style={twStyle(
              "mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            )}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} integration`}
            accessibilityHint="Opens the integration setup in your browser"
          >
            <View
              style={twStyle(
                "mr-3 h-11 w-11 items-center justify-center rounded-full bg-indigo-50"
              )}
            >
              <Ionicons name={item.icon} size={22} color="#4f46e5" />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>{item.title}</Text>
              <Text style={twStyle("mt-0.5 text-sm text-gray-500")}>{item.description}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
        ))}

        <Text style={twStyle("mt-2 text-xs text-gray-500 text-center")}>
          More integrations are added in the web dashboard and appear here automatically.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
