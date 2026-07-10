export function paycloudAccountEnvironmentLabel(
  environment: "sandbox" | "live" | "mixed" | null | undefined,
): string | null {
  if (!environment) return null;
  if (environment === "sandbox") return "Test";
  if (environment === "live") return "Live";
  return "Test & Live";
}
