export { AiPlatformHub as CpIntegrationAiPage, AiPlatformHub } from "./ai-platform/AiPlatformHub";

/** Legacy Gemini page — redirect users to the unified AI Platform hub. */
export function CpIntegrationGeminiRedirectPage() {
  if (typeof window !== "undefined") {
    window.location.replace("/admin/control-plane/integrations/ai");
  }
  return <p className="text-sm text-gray-500">Redirecting to AI Platform…</p>;
}
