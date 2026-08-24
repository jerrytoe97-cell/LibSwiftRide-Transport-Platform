import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, LibSwiftRideClient, message, messages, money, passengerMessage, passengerMessages, rideStatusLabel } from "./src.js";

describe("SDK", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("formats Liberian dollar minor units", () => {
    expect(money(12_500)).toContain("125");
  });
  it("starts unauthenticated outside a browser", () => {
    expect(new LibSwiftRideClient().hasSession()).toBe(false);
  });
  it("keeps English and French message keys aligned", () => {
    expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
    expect(Object.keys(passengerMessages.en)).toEqual(Object.keys(passengerMessages.fr));
    expect(message("fr", "payment")).toBe("Paiement");
    expect(passengerMessage("fr", "confirmRide")).toBe("Confirmer la course");
    expect(passengerMessage("fr", "savedPlaces")).toBe("Lieux enregistrés");
    expect(passengerMessage("fr", "referralWallet")).toBe("Portefeuille de parrainage");
    expect(passengerMessage("fr", "sendParcel")).toBe("Envoyer un colis");
    expect(passengerMessage("fr", "confirmCancellation")).toBe("Confirmer l'annulation");
    expect(passengerMessage("fr", "totalPaid")).toBe("Total payé");
    expect(passengerMessage("fr", "emergencyGpsHint")).toContain("position GPS");
    expect(rideStatusLabel("DRIVER_ARRIVING", "fr")).toBe("Chauffeur en route");
  });
  it("preserves API error codes for clear client recovery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "ROUTE_UNAVAILABLE", message: "No route" } }), { status: 422 })));
    await expect(new LibSwiftRideClient().request("/rides/quote")).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE", status: 422 });
  });
  it("classifies fetch failures as network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const request = new LibSwiftRideClient().request("/rides/quote");
    await expect(request).rejects.toMatchObject({ code: "NETWORK_FAILURE", name: ApiRequestError.name });
  });
  it("reports non-JSON gateway responses without exposing browser parsing errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));
    await expect(new LibSwiftRideClient().request("/auth/register")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 404,
      message: "LibSwiftRide returned an invalid server response. Please try again."
    });
  });
  it("keeps empty error responses actionable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    await expect(new LibSwiftRideClient().request("/auth/register")).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      status: 502
    });
  });
  it("constructs API request paths without allowing a path to replace the configured API prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new LibSwiftRideClient().request("/auth/register");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/v1/auth/register", expect.any(Object));
  });
  it("preserves an explicit image content type for authenticated profile uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { available: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    await new LibSwiftRideClient().request("/profile/photo", { method: "PUT", headers: { "content-type": image.type }, body: image });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("content-type")).toBe("image/jpeg");
  });
});

describe("role-bound login", () => {
  it("rejects a valid account from the wrong portal before storing its session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { id: "driver-id", role: "DRIVER" },
      tokens: { accessToken: "access-token", refreshToken: "refresh-token" }
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(new LibSwiftRideClient().login("0770000000", "private-password", true, "PASSENGER"))
      .rejects.toMatchObject({ code: "WRONG_PORTAL", status: 403 });
    vi.unstubAllGlobals();
  });
});
