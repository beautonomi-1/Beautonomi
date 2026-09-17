import { useCallback, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { AdminSection } from "@beautonomi/admin-access";

export type CopilotPageContext = {
  entityType: "provider" | "user" | "booking" | "support_ticket" | "payout" | "refund" | "fraud_case" | "content_report";
  entityId: string;
  label?: string;
};

export type CopilotMessage = { role: "user" | "assistant"; content: string };

export type CopilotDisambiguationOption = {
  entityType: string;
  entityId: string;
  label: string;
  subtitle?: string;
};

type CopilotResponse = {
  answer?: string;
  conversationId?: string;
  resolvedEntities?: Record<string, { entityType: string; entityId: string; label?: string }>;
  disambiguation?: { prompt: string; options: CopilotDisambiguationOption[] };
  proposedAction?: { actionId: string; actionType: string; assistDeepLink: string };
  toolCalls?: number;
  deniedTools?: string[];
};

function newConversationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `conv-${Date.now()}`;
}

export function useAdminCopilot(pageContext?: CopilotPageContext) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [disambiguation, setDisambiguation] = useState<CopilotDisambiguationOption[] | null>(null);
  const [proposedAction, setProposedAction] = useState<CopilotResponse["proposedAction"]>();
  const conversationIdRef = useRef<string>(newConversationId());
  const resolvedEntitiesRef = useRef<CopilotResponse["resolvedEntities"]>({});

  const ask = useCallback(
    async (question: string, selectedEntity?: CopilotDisambiguationOption) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      setBusy(true);
      setDisambiguation(null);
      setProposedAction(undefined);

      const userMsg: CopilotMessage = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMsg].slice(-16));

      try {
        const res = await adminApi.postJson<CopilotResponse>("/api/admin/copilot", {
          question: trimmed,
          pageContext,
          conversationId: conversationIdRef.current,
          messages: [...messages, userMsg].slice(-8),
          resolvedEntities: resolvedEntitiesRef.current,
          selectedEntity: selectedEntity
            ? {
                entityType: selectedEntity.entityType,
                entityId: selectedEntity.entityId,
                label: selectedEntity.label,
              }
            : undefined,
        });

        if (res.conversationId) conversationIdRef.current = res.conversationId;
        if (res.resolvedEntities) resolvedEntitiesRef.current = res.resolvedEntities;

        if (res.disambiguation?.options?.length) {
          setDisambiguation(res.disambiguation.options);
          const assistantMsg: CopilotMessage = {
            role: "assistant",
            content: res.disambiguation.prompt ?? res.answer ?? "Which one did you mean?",
          };
          setMessages((prev) => [...prev, assistantMsg].slice(-16));
          return;
        }

        const assistantMsg: CopilotMessage = {
          role: "assistant",
          content: res.answer ?? "No answer returned.",
        };
        setMessages((prev) => [...prev, assistantMsg].slice(-16));
        if (res.proposedAction) setProposedAction(res.proposedAction);
      } catch (e) {
        const err = e instanceof Error ? e.message : "Copilot failed";
        setMessages((prev) => [...prev, { role: "assistant" as const, content: err }].slice(-16));
      } finally {
        setBusy(false);
      }
    },
    [messages, pageContext],
  );

  const pickDisambiguation = useCallback(
    (option: CopilotDisambiguationOption, lastQuestion: string) => {
      void ask(lastQuestion, option);
    },
    [ask],
  );

  const resetConversation = useCallback(() => {
    conversationIdRef.current = newConversationId();
    resolvedEntitiesRef.current = {};
    setMessages([]);
    setDisambiguation(null);
    setProposedAction(undefined);
  }, []);

  return {
    ask,
    messages,
    busy,
    disambiguation,
    proposedAction,
    pickDisambiguation,
    resetConversation,
    conversationId: conversationIdRef.current,
  };
}

export type { AdminSection };
