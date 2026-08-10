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
});
