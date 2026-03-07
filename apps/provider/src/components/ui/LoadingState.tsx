import { View, Text, ActivityIndicator } from "react-native";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingState({ message = "Loading...", fullScreen = true }: LoadingStateProps) {
  return (
    <View style={[{ alignItems: "center", justifyContent: "center" }, fullScreen ? { flex: 1 } : { paddingVertical: 48 }]}>
      <ActivityIndicator size="large" color="#111" />
      <Text style={{ marginTop: 12, fontSize: 14, color: "#6b7280" }}>{message}</Text>
    </View>
  );
}
