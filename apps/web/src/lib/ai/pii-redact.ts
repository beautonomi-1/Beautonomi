/**
 * PII redaction for all LLM calls. Delegates to the richer prompt redactor.
 */
import { redactPromptText } from "@/lib/ai/redact-prompt-pii";

export function redactPii(text: string): string {
  return redactPromptText(text);
}
