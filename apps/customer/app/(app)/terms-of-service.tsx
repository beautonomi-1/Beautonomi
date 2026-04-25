import { ScrollView, Text, View } from "react-native";
import { Colors } from "@/constants/colors";

export default function TermsOfServiceScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
        Terms of Service
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 21, color: Colors.gray[600] }}>
        These terms describe the core rules for using Beautonomi in-app features. This mobile summary is for convenience and does not replace any legally binding terms where published.
      </Text>

      <Section title="Using the platform">
        You agree to provide accurate information, keep your account secure, and use the app lawfully and respectfully.
      </Section>
      <Section title="Bookings and orders">
        Prices, availability, and provider terms may vary. Cancellations, no-shows, fulfillment, and return outcomes depend on applicable policy and context.
      </Section>
      <Section title="Payments">
        Payments and refunds are processed according to checkout terms, provider rules, and payment-partner requirements.
      </Section>
      <Section title="Content and conduct">
        Do not post or send unlawful, abusive, fraudulent, or infringing content. Accounts may be restricted for misuse or safety concerns.
      </Section>
      <Section title="Service availability">
        Features may change or be unavailable from time to time due to maintenance, region, compliance, or technical limitations.
      </Section>
      <Section title="Support and disputes">
        If something goes wrong, open a support ticket in-app so the team can investigate with your booking/order details.
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

