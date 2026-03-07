import { View, Text, Linking, Pressable } from "react-native";
import { Colors } from "@/constants/colors";

type WrongAppScreenProps = {
  /** "provider" | "admin" */
  portal: string;
  onSignOut?: () => void;
};

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "";

export function WrongAppScreen({ portal, onSignOut }: WrongAppScreenProps) {
  const isProvider = portal === "provider";
  const isAdmin = portal === "admin";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>Wrong app</Text>
      <Text style={{ fontSize: 16, color: Colors.gray[600], textAlign: "center", marginBottom: 24 }}>
        {isProvider && "This account is a Provider. Open the Provider app to access your business dashboard."}
        {isAdmin && "This account has admin access. Use the web admin portal to manage the platform."}
      </Text>
      {isAdmin && APP_URL ? (
        <Pressable
          onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/admin/dashboard`)}
          style={{ marginBottom: 12, minWidth: 200, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: Colors.primary, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: Colors.white, fontWeight: "500" }}>Open Admin on Web</Text>
        </Pressable>
      ) : null}
      {onSignOut && (
        <Pressable
          onPress={onSignOut}
          style={{ minWidth: 200, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}
