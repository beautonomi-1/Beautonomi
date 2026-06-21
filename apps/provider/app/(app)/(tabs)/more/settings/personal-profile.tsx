/**
 * §provider-setup-seamless-ux 2026-05: targeted Personal Profile screen for
 * freelancer providers.
 *
 * The `personal-profile` step in /api/provider/setup-status is gated on
 * `user_profiles.about` (and a couple of supporting fields). Previously the
 * only way to fill this in from the mobile app was the full 14-step wizard.
 * This screen lets a freelancer fix just that field, then bounces back to the
 * setup checklist where the row will flip to completed on next focus.
 */
import { useCallback, useEffect, useState } from "react";
import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";

const SOFT_LIMIT = 200;
const HARD_LIMIT = 1000;

type MeProfile = {
  id?: string;
  full_name?: string | null;
  preferred_name?: string | null;
  avatar_url?: string | null;
  about?: string | null;
  biography_title?: string | null;
};

export default function PersonalProfileScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<MeProfile>("/api/me/profile");

  const [about, setAbout] = useState("");
  const [biographyTitle, setBiographyTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setAbout(typeof data.about === "string" ? data.about : "");
    setBiographyTitle(
      typeof data.biography_title === "string" ? data.biography_title : "",
    );
  }, [data]);

  const displayName =
    data?.preferred_name ||
    data?.full_name ||
    "Your profile";

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const trimmed = about.trim();
    if (trimmed.length === 0) {
      setSaveError("Add a short bio so customers know who they're booking with.");
      return;
    }
    if (trimmed.length > HARD_LIMIT) {
      setSaveError(`Bio is too long. Keep it under ${HARD_LIMIT} characters.`);
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await api.patch("/api/me/profile", {
        about: trimmed,
        biography_title: biographyTitle.trim() || null,
      });
      if (res.error) {
        const message =
          res.error instanceof Error
            ? res.error.message
            : typeof res.error === "string"
              ? res.error
              : "Failed to save personal profile";
        setSaveError(message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save personal profile";
      setSaveError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }, [about, biographyTitle, router]);

  if (loading && !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Personal Profile" />
        <LoadingState message="Loading your profile…" />
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Personal Profile" />
        <ErrorState
          message="Couldn't load your profile."
          onRetry={() => {
            void refresh();
          }}
        />
      </ScreenContainer>
    );
  }

  const aboutLen = about.length;
  const aboutOver = aboutLen > SOFT_LIMIT;
  const canSave = !saving && about.trim().length > 0;

  return (
    <ScreenContainer>
      <ScreenHeader title="Personal Profile" subtitle={displayName} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        style={{ flex: 1 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 14 }}>
            Add a short bio so customers know who they&apos;re booking with.
            Keep it warm, personal, and to the point.
          </Text>

          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700], marginBottom: 6 }}>
            Headline (optional)
          </Text>
          <TextInput
            value={biographyTitle}
            onChangeText={setBiographyTitle}
            placeholder="e.g. Hairstylist & color specialist, 10+ years"
            maxLength={120}
            style={{
              backgroundColor: Colors.white,
              borderWidth: 1,
              borderColor: Colors.gray[200],
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: Colors.gray[900],
              marginBottom: 18,
            }}
            placeholderTextColor={Colors.gray[400]}
          />

          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700], marginBottom: 6 }}>
            Bio
          </Text>
          <TextInput
            value={about}
            onChangeText={(v) => {
              if (v.length <= HARD_LIMIT) setAbout(v);
            }}
            placeholder="Share a little about your background, your style, and what clients can expect from a session with you."
            multiline
            textAlignVertical="top"
            style={{
              backgroundColor: Colors.white,
              borderWidth: 1,
              borderColor: aboutOver ? "#fcd34d" : Colors.gray[200],
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: Colors.gray[900],
              minHeight: 160,
            }}
            placeholderTextColor={Colors.gray[400]}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 6,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: aboutOver ? "#b45309" : Colors.gray[500],
              }}
            >
              {aboutOver
                ? `Soft limit ${SOFT_LIMIT}. Customers prefer concise bios.`
                : `${aboutLen}/${SOFT_LIMIT}`}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.gray[400] }}>
              Max {HARD_LIMIT}
            </Text>
          </View>

          {saveError && (
            <View
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#fecaca",
                backgroundColor: "#fef2f2",
              }}
              accessibilityLiveRegion="polite"
            >
              <Text style={{ fontSize: 13, color: "#991b1b" }}>{saveError}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
            style={{
              marginTop: 22,
              backgroundColor: canSave ? Colors.primary : Colors.gray[300],
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel="Save personal profile"
            accessibilityState={{ disabled: !canSave }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
