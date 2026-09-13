import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { captureError } from "@/lib/sentry";
import { Colors } from "@/constants/colors";
import { i18n } from "@beautonomi/i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function eb(key: string): string {
  return i18n.t(`customer.mobile.components.errorBoundary.${key}`) as string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary:", error, errorInfo);
    captureError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback;
    }
    if (this.state.hasError) {
      return (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.white, padding: 24 }}
          accessibilityRole="alert"
          accessibilityLabel={eb("a11y")}
        >
          <Text style={{ marginBottom: 8, textAlign: "center", fontSize: 18, fontWeight: "600", color: Colors.error }}>{eb("title")}</Text>
          <Text style={{ marginBottom: 24, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
            {__DEV__ && this.state.error?.message ? this.state.error.message : eb("body")}
          </Text>
          <TouchableOpacity
            style={{ borderRadius: 8, backgroundColor: Colors.gray[900], paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel={eb("retryA11y")}
            accessibilityHint={eb("retryHint")}
          >
            <Text style={{ fontWeight: "500", color: Colors.white }}>{eb("retry")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
