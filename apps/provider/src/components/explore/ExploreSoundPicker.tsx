import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";

export type ExploreSoundPickerItem = {
  id: string;
  title: string;
  public_url?: string | null;
  source?: "platform" | "provider";
};

export type ExploreSoundPickerLabels = {
  addMusic: string;
  originalAudio: string;
  viewerHint: string;
  soundsEmpty: string;
  sectionPlatform: string;
  sectionYours: string;
  previewPlay: string;
  previewStop: string;
};

type Props = {
  sounds: ExploreSoundPickerItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  labels: ExploreSoundPickerLabels;
};

export function ExploreSoundPicker({ sounds, value, onChange, disabled, labels }: Props) {
  const playerRef = useRef<{ remove: () => void; pause: () => void } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    playerRef.current?.pause();
    playerRef.current?.remove();
    playerRef.current = null;
    setPreviewId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const togglePreview = useCallback(
    async (sound: ExploreSoundPickerItem) => {
      if (!sound.public_url || disabled) return;
      if (previewId === sound.id) {
        stopPreview();
        return;
      }
      stopPreview();
      try {
        const { createAudioPlayer, setAudioModeAsync } = await import("expo-audio");
        await setAudioModeAsync({ playsInSilentMode: true });
        const player = createAudioPlayer({ uri: sound.public_url });
        player.loop = false;
        playerRef.current = player;
        setPreviewId(sound.id);
        player.play();
      } catch {
        setPreviewId(null);
      }
    },
    [disabled, previewId, stopPreview],
  );

  const platform = sounds.filter((s) => s.source === "platform");
  const provider = sounds.filter((s) => s.source !== "platform");

  const chip = (sound: ExploreSoundPickerItem) => {
    const selected = value === sound.id;
    return (
      <View
        key={sound.id}
        style={twStyle(
          `me-2 flex-row items-center rounded-full border px-3 py-2 ${selected ? "border-violet-600 bg-violet-600" : "border-gray-200 bg-gray-50"}`,
        )}
      >
        <TouchableOpacity
          disabled={disabled}
          onPress={() => {
            stopPreview();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(sound.id);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={sound.title}
        >
          <Text
            style={twStyle(
              `max-w-[140px] text-sm font-medium ${selected ? "text-white" : "text-gray-800"}`,
            )}
            numberOfLines={1}
          >
            {selected ? "✓ " : ""}
            {sound.title}
          </Text>
        </TouchableOpacity>
        {sound.public_url ? (
          <TouchableOpacity
            disabled={disabled}
            onPress={() => void togglePreview(sound)}
            style={twStyle("ms-1 p-1")}
            accessibilityLabel={previewId === sound.id ? labels.previewStop : labels.previewPlay}
          >
            <Ionicons
              name={previewId === sound.id ? "pause" : "play"}
              size={16}
              color={selected ? "#fff" : "#4b5563"}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const section = (title: string, items: ExploreSoundPickerItem[]) => {
    if (!items.length) return null;
    return (
      <View style={twStyle("mb-3")}>
        <Text style={twStyle("mb-2 text-xs font-medium uppercase tracking-wide text-gray-500")}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {items.map(chip)}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={twStyle("mb-4")}>
      <Text style={twStyle("text-sm font-medium text-gray-700")}>{labels.addMusic}</Text>
      <Text style={twStyle("mt-1 text-xs text-gray-500")}>{labels.viewerHint}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mt-3 -mx-1")}>
        <TouchableOpacity
          disabled={disabled}
          onPress={() => {
            stopPreview();
            onChange(null);
          }}
          style={[
            twStyle("me-2 rounded-full px-4 py-2"),
            value === null ? twStyle("bg-violet-600") : twStyle("bg-gray-100"),
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
        >
          <Text style={twStyle(value === null ? "text-sm font-medium text-white" : "text-sm text-gray-600")}>
            {labels.originalAudio}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      {sounds.length === 0 ? (
        <Text style={twStyle("mt-2 text-sm text-gray-500")}>{labels.soundsEmpty}</Text>
      ) : (
        <>
          {section(labels.sectionPlatform, platform.length ? platform : sounds.filter((s) => !s.source))}
          {section(labels.sectionYours, provider)}
        </>
      )}
    </View>
  );
}
