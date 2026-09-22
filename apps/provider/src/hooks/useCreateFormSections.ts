import { useCallback, useRef } from "react";
import type { ScrollView } from "react-native";

export function useCreateFormSections() {
  const sectionY = useRef<Partial<Record<string, number>>>({});
  const participantRowY = useRef<Partial<Record<number, number>>>({});

  const registerSection = useCallback((sectionKey: string, y: number) => {
    sectionY.current[sectionKey] = y;
  }, []);

  const registerParticipantRow = useCallback((index: number, y: number) => {
    participantRowY.current[index] = y;
  }, []);

  const scrollToSection = useCallback(
    (
      scrollRef: React.RefObject<ScrollView | null>,
      sectionKey: string,
      participantIndex?: number,
    ) => {
      if (sectionKey === "participants" && participantIndex != null) {
        const y = participantRowY.current[participantIndex];
        if (y != null) {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
          return;
        }
        scrollRef.current?.scrollToEnd({ animated: true });
        return;
      }
      const y = sectionY.current[sectionKey];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      }
    },
    [],
  );

  const resetSections = useCallback(() => {
    sectionY.current = {};
    participantRowY.current = {};
  }, []);

  return {
    registerSection,
    registerParticipantRow,
    scrollToSection,
    resetSections,
  };
}
