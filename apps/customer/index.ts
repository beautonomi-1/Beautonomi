// Custom entry point for monorepo compatibility.
// Single synchronous import so web gets one bundle (no chunk fetch that can "fail to load response data").
import "react-native-gesture-handler";
import "expo-router/entry";
