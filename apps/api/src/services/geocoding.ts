import { z } from "zod";
import { config } from "../config.js";
import { resilientFetch } from "./http-client.js";

export const addressQuery = z.string().trim().min(3).max(150).refine((value) => !value.includes(";") && value.split(/\s+/).length <= 20, "Enter a shorter address without semicolons");
export const gpsQuery = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) });
export type AddressPlace = { id: string; address: string; latitude: number; longitude: number };
const providerResponse = z.object({ features: z.array(z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.object({ mapbox_id: z.string(), full_address: z.string().optional(), name: z.string().optional(), place_formatted: z.string().optional() })
})).max(10) });

export class GeocodingError extends Error {
  constructor() { super("Address lookup is unavailable. Try a supported landmark or saved place."); }
}

export async function geocode(input: { query: string } | z.infer<typeof gpsQuery>,
  fetchAddress: typeof resilientFetch = resilientFetch,
  settings = { enabled: config.GEOCODING_ENABLED, token: config.GEOCODING_API_TOKEN }): Promise<AddressPlace[]> {
  const forward = "query" in input;
  const parameters = forward
    ? new URLSearchParams({ q: addressQuery.parse(input.query), autocomplete: "true", limit: "6", proximity: "-10.78,6.30" })
    : new URLSearchParams(Object.entries(gpsQuery.parse(input)).map(([key, value]) => [key, String(value)]));
  if (!settings.enabled || !settings.token) throw new GeocodingError();
  parameters.set("access_token", settings.token);
  parameters.set("country", "LR");
  parameters.set("language", "en");
  parameters.set("types", "address,street,neighborhood,locality,place");
  // Addresses and coordinates are persisted on rides/favourites. Temporary
  // geocoding results cannot be stored; activation requires permanent rights.
  parameters.set("permanent", "true");
  try {
    const response = await fetchAddress(`https://api.mapbox.com/search/geocode/v6/${forward ? "forward" : "reverse"}?${parameters}`, {
      headers: { accept: "application/json" }, redirect: "error", timeoutMs: 8_000, attempts: 1
    });
    if (!response.ok) throw new GeocodingError();
    const parsed = providerResponse.parse(await response.json());
    return parsed.features.map(({ properties, geometry }) => ({
      id: properties.mapbox_id,
      address: properties.full_address ?? [properties.name, properties.place_formatted].filter(Boolean).join(", "),
      longitude: geometry.coordinates[0], latitude: geometry.coordinates[1]
    })).filter((place) => place.address.trim().length >= 3);
  } catch {
    // Never propagate provider errors, URLs, response bodies or tokens to logs/client.
    throw new GeocodingError();
  }
}
