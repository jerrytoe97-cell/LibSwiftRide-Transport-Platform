import { apiClient } from "@libswiftride/sdk";
import { isValidTripLocation, type TripLocation } from "./trip-input.js";

export async function searchAddresses(query: string, signal: AbortSignal): Promise<Array<TripLocation & { id: string }>> {
  const result = await apiClient.request<{ data: Array<TripLocation & { id: string }> }>("/locations/search", {
    method: "POST", body: JSON.stringify({ query }), signal
  });
  if (!Array.isArray(result.data) || !result.data.every(isValidTripLocation)) throw new Error("Invalid address search result");
  return result.data;
}

// Provider credentials stay on the API, never in Passenger's environment/bundle.
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  if (!isValidTripLocation({ address: "GPS", latitude, longitude })) throw new Error("Invalid GPS coordinates");
  const result = await apiClient.request<{ data: TripLocation | null }>("/locations/reverse", {
    method: "POST", body: JSON.stringify({ latitude, longitude }), signal: AbortSignal.timeout(10_000)
  });
  if (!result.data || !isValidTripLocation(result.data)) throw new Error("No address was found at this GPS position. Select your pickup manually.");
  return result.data.address;
}
