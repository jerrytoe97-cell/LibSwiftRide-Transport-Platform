export function resolveMapProvider(provider: string | undefined, browserKey: string | undefined) {
  const requested = provider?.trim().toLowerCase() || "preview";
  const key = requested === "google" ? browserKey?.trim() : undefined;
  return { provider: requested === "google" && key ? "google" as const : "preview" as const, googleMapsBrowserKey: key || undefined };
}
