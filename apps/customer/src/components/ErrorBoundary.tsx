import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { captureError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
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
          className="flex-1 items-center justify-center bg-white p-6"
          accessibilityRole="alert"
          accessibilityLabel="Application error occurred"
        >
          <Text className="mb-2 text-center text-lg font-semibold text-red-600">
            Something went wrong
          </Text>
          <Text className="mb-6 text-center text-sm text-gray-500">
            {__DEV__ && this.state.error?.message
              ? this.state.error.message
              : "An unexpected error occurred. Please try again."}
          </Text>
          <TouchableOpacity
            className="rounded-lg bg-gray-900 px-6 py-3"
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            accessibilityHint="Tap to reload the application"
          >
            <Text className="font-medium text-white">Tap to retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
