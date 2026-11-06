import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "@beautonomi/i18n";
import {
  generateRecoveryCodes,
  getRecoveryCodeCount,
  listTrustedDevices,
  listVerifiedTotpFactors,
  notifyMfaChanged,
  revokeTrustedDevice,
  securityErrorMessage,
  startTotpChallenge,
  startTotpEnrollment,
  unenrollTotpFactor,
  verifyMfaTotp,
  type TotpEnrollment,
  type TrustedDevice,
} from "@beautonomi/auth-security";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { supabase } from "@/lib/supabase/client";
import { providerSecurityApi } from "@/lib/security/security-api";
import { securityStyles } from "@/components/security/SessionVerifyPanel";
import { Colors } from "@/constants/colors";

const card = {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: Colors.gray[200],
  backgroundColor: Colors.white,
  padding: 16,
  gap: 12,
  marginBottom: 20,
};

export default function SettingsTwoStepScreen() {
  const { t } = useTranslation();
  const sk = (key: string, vars?: Record<string, unknown>) =>
    t(`provider.mobile.screens.security.${key}`, vars) as string;

  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);

  const loadDevices = useCallback(async () => {
    const res = await listTrustedDevices(providerSecurityApi);
    setDevices(res.data?.devices ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const factors = await listVerifiedTotpFactors(supabase);
      setFactorId(factors[0]?.id ?? null);
      if (factors[0]) {
        const res = await getRecoveryCodeCount(providerSecurityApi);
        setRemaining(res.data?.remaining ?? null);
      } else {
        setRemaining(null);
      }
    } catch {
      setError(sk("statusFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    void loadDevices();
  }, [load, loadDevices]);

  const confirmCode = async (targetFactorId: string, value: string): Promise<boolean> => {
    const { challengeId, error: chError } = await startTotpChallenge(supabase, targetFactorId);
    if (chError || !challengeId) {
      setError(chError?.message ?? sk("wrongTotp"));
      return false;
    }
    const { error: verifyError } = await verifyMfaTotp(supabase, targetFactorId, challengeId, value);
    if (verifyError) {
      setError(sk("wrongTotp"));
      setCode("");
      return false;
    }
    return true;
  };

  const beginEnroll = async () => {
    setBusy(true);
    setError(null);
    const { data, error: enrollError } = await startTotpEnrollment(supabase, "Beautonomi");
    setBusy(false);
    if (enrollError || !data) {
      setError(enrollError?.message ?? sk("statusFailed"));
      return;
    }
    setCode("");
    setEnrollment(data);
  };

  const finishEnroll = async (value: string) => {
    if (!enrollment || busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    if (!(await confirmCode(enrollment.factorId, value))) {
      setBusy(false);
      return;
    }
    await notifyMfaChanged(providerSecurityApi, "enrolled");
    const gen = await generateRecoveryCodes(providerSecurityApi);
    setEnrollment(null);
    setBusy(false);
    if (gen.data?.codes?.length) setCodes(gen.data.codes);
    else setError(sk("codesFailed"));
    await load();
    await loadDevices();
  };

  const finishDisable = async (value: string) => {
    if (!factorId || busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    if (!(await confirmCode(factorId, value))) {
      setBusy(false);
      return;
    }
    const { error: unenrollError } = await unenrollTotpFactor(supabase, factorId);
    if (unenrollError) {
      setError(unenrollError.message);
      setBusy(false);
      return;
    }
    await notifyMfaChanged(providerSecurityApi, "unenrolled");
    setDisabling(false);
    setBusy(false);
    Alert.alert(sk("disabledToast"));
    await load();
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    const res = await generateRecoveryCodes(providerSecurityApi);
    setBusy(false);
    if (res.error || !res.data?.codes) {
      setError(securityErrorMessage(res.error, sk("codesFailed")));
      return;
    }
    setCodes(res.data.codes);
    setRemaining(res.data.codes.length);
  };

  const confirmRemoveDevice = (d: TrustedDevice) => {
    Alert.alert(sk("removeTitle"), d.is_current ? sk("removeCurrentBody") : sk("removeOtherBody"), [
      { text: sk("cancel"), style: "cancel" },
      {
        text: sk("remove"),
        style: "destructive",
        onPress: () => {
          void revokeTrustedDevice(providerSecurityApi, d.id).then((res) => {
            if (res.error) Alert.alert(securityErrorMessage(res.error));
            void loadDevices();
          });
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={sk("twoStepTitle")} />
      <View style={{ padding: 20 }}>
        {codes ? (
          <View style={card}>
            <Text style={securityStyles.title}>{sk("codesTitle")}</Text>
            <Text style={securityStyles.body}>{sk("codesBody")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: Colors.gray[50], borderRadius: 12, padding: 12 }}>
              {codes.map((c) => (
                <Text key={c} style={{ width: "50%", fontFamily: "monospace", fontSize: 15, paddingVertical: 4 }} selectable>
                  {c}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[securityStyles.secondary, { flex: 1 }]}
                onPress={() => {
                  void Clipboard.setStringAsync(codes.join("\n")).then(() => Alert.alert(sk("copied")));
                }}
              >
                <Text style={securityStyles.secondaryText}>{sk("copy")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={[securityStyles.secondary, { flex: 1 }]}
                onPress={() => void Share.share({ message: codes.join("\n") })}
              >
                <Text style={securityStyles.secondaryText}>{sk("share")}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity accessibilityRole="button" style={securityStyles.primary} onPress={() => setCodes(null)}>
              <Text style={securityStyles.primaryText}>{sk("saved")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={card}>
          <Text style={securityStyles.title}>{sk("twoStepTitle")}</Text>
          {loading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <>
              <Text style={securityStyles.body}>{factorId ? sk("twoStepOn") : sk("twoStepOff")}</Text>
              {factorId && remaining !== null ? (
                <Text style={[securityStyles.hint, remaining <= 2 && { color: Colors.warning }]}>
                  {sk("recoveryLeft", { count: remaining })}
                </Text>
              ) : null}

              {enrollment ? (
                <>
                  <Text style={securityStyles.body}>{sk("scanQr")}</Text>
                  {enrollment.uri ? (
                    <View style={{ alignItems: "center", paddingVertical: 8 }}>
                      <QRCode value={enrollment.uri} size={180} />
                    </View>
                  ) : null}
                  <Text style={securityStyles.hint}>{sk("manualKey")}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => void Clipboard.setStringAsync(enrollment.secret).then(() => Alert.alert(sk("copied")))}
                  >
                    <Text selectable style={{ fontFamily: "monospace", fontSize: 14, color: Colors.gray[800] }}>
                      {enrollment.secret}
                    </Text>
                  </TouchableOpacity>
                  <Text style={securityStyles.body}>{sk("enterCode")}</Text>
                  <OtpDigitRow
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void finishEnroll(v)}
                    disabled={busy}
                    accessibilityLabelPrefix={sk("methodTotp")}
                  />
                  <TouchableOpacity accessibilityRole="button" onPress={() => setEnrollment(null)} disabled={busy}>
                    <Text style={[securityStyles.link, { textAlign: "center" }]}>{sk("cancel")}</Text>
                  </TouchableOpacity>
                </>
              ) : disabling ? (
                <>
                  <Text style={securityStyles.body}>{sk("turnOffBody")}</Text>
                  <OtpDigitRow
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void finishDisable(v)}
                    disabled={busy}
                    autoFocus
                    accessibilityLabelPrefix={sk("methodTotp")}
                  />
                  <TouchableOpacity accessibilityRole="button" onPress={() => setDisabling(false)} disabled={busy}>
                    <Text style={[securityStyles.link, { textAlign: "center" }]}>{sk("cancel")}</Text>
                  </TouchableOpacity>
                </>
              ) : factorId ? (
                <>
                  <TouchableOpacity accessibilityRole="button" style={securityStyles.secondary} onPress={() => void regenerate()} disabled={busy}>
                    <Text style={securityStyles.secondaryText}>{sk("regenerate")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      setCode("");
                      setError(null);
                      setDisabling(true);
                    }}
                  >
                    <Text style={[securityStyles.link, { textAlign: "center", color: Colors.error }]}>{sk("turnOff")}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity accessibilityRole="button" style={securityStyles.primary} onPress={() => void beginEnroll()} disabled={busy}>
                  {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={securityStyles.primaryText}>{sk("setUp")}</Text>}
                </TouchableOpacity>
              )}
              {busy && (enrollment || disabling) ? <ActivityIndicator color={Colors.primary} /> : null}
            </>
          )}
          {error ? <Text style={securityStyles.error} accessibilityRole="alert">{error}</Text> : null}
        </View>

        <View style={card}>
          <Text style={securityStyles.title}>{sk("trustedDevicesTitle")}</Text>
          <Text style={securityStyles.body}>{sk("trustedDevicesBody")}</Text>
          {devices === null ? (
            <ActivityIndicator color={Colors.primary} />
          ) : devices.length === 0 ? (
            <Text style={securityStyles.hint}>{sk("noDevices")}</Text>
          ) : (
            devices.map((d) => (
              <View key={d.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>
                    {d.label || d.platform || sk("unknownDevice")}
                    {d.is_current ? <Text style={{ fontSize: 12, color: Colors.success }}>{`  ${sk("thisDevice")}`}</Text> : null}
                  </Text>
                  {d.last_seen_at ? (
                    <Text style={securityStyles.hint}>
                      {sk("lastActive", { date: new Date(d.last_seen_at).toLocaleDateString() })}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={() => confirmRemoveDevice(d)}>
                  <Text style={securityStyles.link}>{sk("remove")}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}
