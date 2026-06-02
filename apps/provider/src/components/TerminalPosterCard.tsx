import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Image, Modal, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { twStyle } from "@/lib/twStyle";

type TerminalLike = {
  display_name?: string | null;
  name?: string | null;
  terminal_code: string;
  payment_link?: string | null;
  terminal_url?: string | null;
  qr_url?: string | null;
  poster_url?: string | null;
};

/**
 * Shows the terminal poster + a locally-rendered QR (so a scannable code is always available
 * even before Ops uploads a branded poster), with full-screen, save-to-photos, share-image,
 * and print actions so a provider can present it to a customer or display it in-store.
 */
export function TerminalPosterCard({
  terminal,
  open,
  onOpenChange,
}: {
  terminal: TerminalLike;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const qrValue =
    terminal.payment_link ||
    terminal.terminal_url ||
    `https://paystack.shop/pay/${terminal.terminal_code}`;
  const [internalFullScreen, setInternalFullScreen] = useState(false);
  // Supports an optional controlled open state so a parent action (e.g. "Open QR poster") can
  // present the scannable poster; falls back to its own state when used standalone.
  const fullScreen = open ?? internalFullScreen;
  const setFullScreen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalFullScreen(next);
  };
  const [busy, setBusy] = useState<null | "save" | "share" | "print">(null);
  const qrDataUrlRef = useRef<string | null>(null);
  const qrRef = useRef<{ toDataURL?: (cb: (data: string) => void) => void } | null>(null);

  const captureQrDataUrl = (): Promise<string | null> =>
    new Promise((resolve) => {
      if (qrDataUrlRef.current) return resolve(qrDataUrlRef.current);
      const ref = qrRef.current;
      if (ref?.toDataURL) {
        ref.toDataURL((data) => {
          qrDataUrlRef.current = data;
          resolve(data);
        });
      } else {
        resolve(null);
      }
    });

  // Returns a local file uri for the poster (preferred) or the locally-rendered QR.
  const resolveLocalImageUri = async (): Promise<string | null> => {
    try {
      if (terminal.poster_url) {
        const target = `${FileSystem.cacheDirectory}terminal-poster-${terminal.terminal_code}.png`;
        const result = await FileSystem.downloadAsync(terminal.poster_url, target);
        return result.uri;
      }
      const base64 = await captureQrDataUrl();
      if (!base64) return null;
      const target = `${FileSystem.cacheDirectory}terminal-qr-${terminal.terminal_code}.png`;
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return target;
    } catch {
      return null;
    }
  };

  const onSave = async () => {
    setBusy("save");
    try {
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission needed", "Allow photo access to save the poster to your device.");
        return;
      }
      const uri = await resolveLocalImageUri();
      if (!uri) {
        Alert.alert("Save poster", "Could not prepare the image to save.");
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Saved", "The poster was saved to your photos.");
    } catch {
      Alert.alert("Save poster", "Could not save the poster. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    setBusy("share");
    try {
      const available = await Sharing.isAvailableAsync();
      const uri = await resolveLocalImageUri();
      if (!available || !uri) {
        Alert.alert("Share poster", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Paystack Terminal poster" });
    } catch {
      Alert.alert("Share poster", "Could not share the poster. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const onPrint = async () => {
    setBusy("print");
    try {
      const name = terminal.display_name || terminal.name || "Pay here";
      let imgSrc = terminal.poster_url || terminal.qr_url || null;
      if (!imgSrc) {
        const base64 = await captureQrDataUrl();
        imgSrc = base64 ? `data:image/png;base64,${base64}` : null;
      }
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>*{font-family:-apple-system,Roboto,sans-serif}body{margin:0;padding:48px;text-align:center;color:#0f172a}
h1{font-size:30px;margin:0 0 8px}p{font-size:18px;color:#334155}img{width:320px;max-width:80%;height:auto;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:24px auto;display:block}
.code{font-family:monospace;font-size:20px}</style></head><body>
<h1>${name}</h1><p>Scan to pay with your phone</p>
${imgSrc ? `<img src="${imgSrc}" alt="QR" />` : "<p>QR not available.</p>"}
<p class="code">${terminal.terminal_code}</p></body></html>`;
      await Print.printAsync({ html });
    } catch {
      Alert.alert("Print poster", "Could not open the print dialog.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={twStyle("mt-3")}>
      <TouchableOpacity
        onPress={() => setFullScreen(true)}
        activeOpacity={0.9}
        style={twStyle("flex-row items-center gap-3 rounded-xl border border-gray-200 bg-white p-3")}
      >
        {terminal.poster_url ? (
          <Image
            source={{ uri: terminal.poster_url }}
            style={{ width: 72, height: 96, borderRadius: 8 }}
            resizeMode="contain"
          />
        ) : (
          <View style={twStyle("rounded-lg bg-white p-1 border border-gray-100")}>
            <QRCode value={qrValue} size={72} getRef={(c) => (qrRef.current = c)} />
          </View>
        )}
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-sm font-semibold text-gray-900")}>Show to customer</Text>
          <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>
            Tap to present full screen, save, share, or print the poster.
          </Text>
        </View>
        <Ionicons name="expand-outline" size={20} color="#16a34a" />
      </TouchableOpacity>

      <Modal visible={fullScreen} animationType="fade" onRequestClose={() => setFullScreen(false)}>
        <View style={twStyle("flex-1 bg-white items-center justify-center p-6")}>
          <Text style={twStyle("text-xl font-bold text-gray-900 mb-1")}>
            {terminal.display_name || terminal.name}
          </Text>
          <Text style={twStyle("text-sm text-gray-500 mb-6")}>Scan to pay</Text>
          {terminal.poster_url ? (
            <Image
              source={{ uri: terminal.poster_url }}
              style={{ width: "100%", height: "55%" }}
              resizeMode="contain"
            />
          ) : (
            <View style={twStyle("rounded-2xl bg-white p-3 border border-gray-100")}>
              <QRCode value={qrValue} size={260} getRef={(c) => (qrRef.current = c)} />
            </View>
          )}
          <Text style={twStyle("mt-4 font-mono text-base text-gray-700")}>{terminal.terminal_code}</Text>

          <View style={twStyle("flex-row flex-wrap gap-2 mt-8 w-full justify-center")}>
            <ActionButton icon="download-outline" label="Save" onPress={onSave} busy={busy === "save"} />
            <ActionButton icon="share-social-outline" label="Share" onPress={onShare} busy={busy === "share"} />
            <ActionButton icon="print-outline" label="Print" onPress={onPrint} busy={busy === "print"} />
          </View>
          <TouchableOpacity onPress={() => setFullScreen(false)} style={twStyle("mt-8")}>
            <Text style={twStyle("text-base font-semibold text-gray-500")}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      style={twStyle("flex-row items-center gap-2 rounded-xl border border-green-600 px-4 py-3")}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#16a34a" />
      ) : (
        <Ionicons name={icon} size={18} color="#16a34a" />
      )}
      <Text style={twStyle("text-green-700 font-semibold")}>{label}</Text>
    </TouchableOpacity>
  );
}
