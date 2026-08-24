import { describe, expect, it } from "vitest";
import { resolveMapProvider } from "./map-provider.js";

describe("driver map provider configuration", () => {
  it("uses the browser key only when Google Maps is requested", () => expect(resolveMapProvider("google", " browser-key ")).toEqual({ provider: "google", googleMapsBrowserKey: "browser-key" }));
  it("falls back to the preview when the Google browser key is missing", () => expect(resolveMapProvider("google", "")).toEqual({ provider: "preview", googleMapsBrowserKey: undefined }));
  it("does not expose a key to the preview provider", () => expect(resolveMapProvider("preview", "server-secret")).toEqual({ provider: "preview", googleMapsBrowserKey: undefined }));
});
