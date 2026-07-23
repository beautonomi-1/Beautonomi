import { useCallback } from "react";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import {
  DOC_TYPE_LABELS,
  requiredDocTypesForEntity,
  type TerminalMerchantApplication,
  type TerminalMerchantDocType,
  type TerminalMerchantEntityType,
} from "./types";

export type ApplicationResponse = {
  application: TerminalMerchantApplication;
  prefill: Record<string, unknown>;
  documents: Array<{
    id: string;
    doc_type: TerminalMerchantDocType;
    status: string;
    rejection_reason?: string | null;
  }>;
  linked_orders: Array<{ id: string; commercial_model?: string }>;
};

export function useTerminalMerchantApplication() {
  const { data, loading, error, refresh } = useApi<ApplicationResponse>(
    "/api/provider/terminal-merchant-application",
  );
  return { data, loading, error, refetch: refresh };
}

export function useSaveTerminalMerchantApplication() {
  const { execute, loading } = useApiMutation<{ application: TerminalMerchantApplication }>("patch");
  const mutateAsync = useCallback(
    (body: Record<string, unknown>) =>
      execute("/api/provider/terminal-merchant-application", body),
    [execute],
  );
  return { mutateAsync, isPending: loading };
}

export function useSubmitTerminalMerchantApplication() {
  const { execute, loading } = useApiMutation<{ application: TerminalMerchantApplication }>("post");
  const mutateAsync = useCallback(
    () => execute("/api/provider/terminal-merchant-application/submit"),
    [execute],
  );
  return { mutateAsync, isPending: loading };
}

export function useUploadTerminalMerchantDocument() {
  return useCallback(
    async (input: {
      doc_type: TerminalMerchantDocType;
      content_base64: string;
      file_name?: string;
      mime_type?: string;
    }) => {
      return api.post<{ document: unknown }>(
        "/api/provider/terminal-merchant-application/documents",
        input,
      );
    },
    [],
  );
}

export { DOC_TYPE_LABELS, requiredDocTypesForEntity };
export type { TerminalMerchantApplication, TerminalMerchantEntityType, TerminalMerchantDocType };
