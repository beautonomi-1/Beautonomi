import { View, Text, Linking, Pressable } from "react-native";

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
    <View className="flex-1 bg-white px-6 justify-center items-center">
      <Text className="text-xl font-semibold text-gray-900 text-center mb-2">
        Wrong app
      </Text>
      <Text className="text-base text-gray-600 text-center mb-6">
        {isProvider &&
          "This account is a Provider. Open the Provider app to access your business dashboard."}
        {isAdmin &&
          "This account has admin access. Use the web admin portal to manage the platform."}
      </Text>
      {isAdmin && APP_URL ? (
        <Pressable
          onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/admin/dashboard`)}
          className="mb-3 min-w-[200px] py-3 px-4 bg-[#FF0077] rounded-lg items-center"
        >
          <Text className="text-white font-medium">Open Admin on Web</Text>
        </Pressable>
      ) : null}
      {onSignOut && (
        <Pressable
          onPress={onSignOut}
          className="min-w-[200px] py-3 px-4 border border-gray-300 rounded-lg items-center"
        >
          <Text className="text-gray-700 font-medium">Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}
