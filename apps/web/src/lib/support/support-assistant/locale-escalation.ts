/** P4: escalate to human when the customer writes in a script the assistant should not auto-handle alone. */
const LATIN_HEAVY = /^[\x00-\x7F\s\d\p{P}]+$/u;

export function shouldEscalateAssistantForMessageLocale(params: {
  userText: string;
  replyLocale: string;
}): boolean {
  const text = params.userText.trim();
  if (text.length < 12) return false;
  if (params.replyLocale && params.replyLocale !== "en") {
    return false;
  }
  if (LATIN_HEAVY.test(text)) return false;
  return true;
}
