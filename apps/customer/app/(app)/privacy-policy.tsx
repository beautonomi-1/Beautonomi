import { ScrollView, Text, View } from "react-native";
import { Colors } from "@/constants/colors";

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
        Privacy Policy
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 21, color: Colors.gray[600] }}>
        This summary explains how Beautonomi handles your information inside the app. It is intended to be readable on mobile and does not replace any applicable legal terms.
      </Text>

      <Section title="Information we collect">
        We collect profile details, booking and order activity, support messages, and device/app usage signals needed to provide and improve the service.
      </Section>
      <Section title="How we use your data">
        Data is used to run bookings, payments, messaging, support, notifications, fraud prevention, and product improvements.
      </Section>
      <Section title="Sharing">
        We share relevant booking/order data with providers you engage with, and with trusted service partners required for operations such as payments, hosting, and analytics.
      </Section>
      <Section title="Security and retention">
        We use technical and organizational safeguards and retain data only as long as needed for service delivery, legal obligations, and safety purposes.
      </Section>
      <Section title="Your choices">
        You can update profile details, manage notification settings, and contact support to request account/data assistance where applicable.
      </Section>
      <Section title="Contact">
        For privacy questions, use Help to Contact support and include "Privacy request" in your subject for faster routing.
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}>{title}</Text>
      <Text style={{ fontSize: 14, lineHeight: 21, color: Colors.gray[600] }}>{children}</Text>
    </View>
  );
}

