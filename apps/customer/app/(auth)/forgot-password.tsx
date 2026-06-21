import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform, ScrollView } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const fp = useCallback((key: string) => t(`customer.mobile.screens.forgotPassword.${key}`), [t]);
  const router = useRouter();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const formNarrow = isTablet || Platform.OS === "web";
  const containerStyle = formNarrow
    ? { width: "100%" as const, maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const }
    : { width: "100%" as const };

  const handleReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert(fp("emailRequiredTitle"), fp("emailRequiredBody"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(fp("invalidEmailTitle"), fp("invalidEmailBody"));
      return;
    }

    const base = (APP_URL ?? "").replace(/\/$/, "");
    if (!base) {
      Alert.alert(fp("configErrorTitle"), fp("configErrorBody"));
      return;
    }
    const redirectTo = `${base}/auth/callback`;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });

      if (error) {
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), error.message);
        return;
      }

      setSent(true);
    } catch {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), fp("genericErrorBody"));
    } finally {
      setLoading(false);
    }
  };

  return (
    // §UI-audit 2026-04: replaced the hardcoded `paddingTop: 60` with
    // a real top safe-area edge so the back button lives below the
    // notch on every device size.
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: Colors.white }}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: contentPadding,
          paddingTop: 24,
          paddingBottom: 220,
          ...(formNarrow ? { alignItems: "center" as const } : {}),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={containerStyle}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 32, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel={fp("goBackA11y")}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.gray[900]} />
        </TouchableOpacity>

        {sent ? (
          <View style={{ alignItems: "center", paddingTop: 32 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#F0FDF4", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
              <Ionicons name="mail-outline" size={40} color="#059669" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], textAlign: "center", marginBottom: 12 }}>
              {fp("checkEmailTitle")}
            </Text>
            <Text style={{ fontSize: 16, color: Colors.gray[500], textAlign: "center", marginBottom: 8, lineHeight: 24 }}>
              {fp("sentLead")}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginBottom: 32 }}>{email.trim().toLowerCase()}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[400], textAlign: "center", marginBottom: 32, lineHeight: 20 }}>
              {fp("spamHint")}
            </Text>

            <TouchableOpacity
              style={{ width: "100%", borderRadius: 12, paddingVertical: 14, marginBottom: 16, backgroundColor: Colors.primary }}
              onPress={() => { setSent(false); setEmail(""); }}
              accessibilityRole="button"
              accessibilityLabel={fp("tryDifferentEmailA11y")}
            >
              <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: Colors.white }}>{fp("tryDifferentEmail")}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} accessibilityRole="link" accessibilityLabel={fp("backToLoginA11y")}>
              <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
                {fp("backToLoginLead")}{" "}
                <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("auth.login")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>{fp("resetTitle")}</Text>
              <Text style={{ fontSize: 16, color: Colors.gray[500], lineHeight: 24 }}>{fp("resetSubtitle")}</Text>
            </View>

            <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{fp("emailLabel")}</Text>
            <TextInput
              style={{ marginBottom: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder={fp("emailPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              returnKeyType="done"
              onSubmitEditing={handleReset}
              accessibilityLabel={fp("emailInputA11y")}
            />

            <TouchableOpacity
              style={{ borderRadius: 12, paddingVertical: 14, backgroundColor: Colors.primary }}
              onPress={handleReset}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={fp("sendResetLinkA11y")}
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: Colors.white }}>{fp("sendResetLink")}</Text>
              )}
            </TouchableOpacity>

            <View style={{ marginTop: 32 }}>
              <TouchableOpacity onPress={() => router.back()} accessibilityRole="link" accessibilityLabel={fp("backToLoginA11y")}>
                <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
                  {fp("rememberPasswordLead")}{" "}
                  <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("auth.login")}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
