const environment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const API_URL = environment?.VITE_API_URL ?? "http://localhost:4000/api/v1";
const WS_URL = environment?.VITE_WS_URL ?? "ws://localhost:4000/ws";

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export class LibSwiftRideClient {
  constructor(private accessToken = typeof sessionStorage === "undefined" ? "" : sessionStorage.getItem("lsr_access_token") ?? "") {}

  setAccessToken(token: string) {
    this.accessToken = token;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem("lsr_access_token", token);
  }

  hasSession() {
    return Boolean(this.accessToken);
  }

  async login(phone: string, password: string) {
    const result = await this.request<{ tokens: { accessToken: string; refreshToken: string } }>("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) });
    this.setAccessToken(result.tokens.accessToken);
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem("lsr_refresh_token", result.tokens.refreshToken);
    return result;
  }

  async request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);
    if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    const body = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new Error((body as ApiError)?.error?.message ?? `Request failed (${response.status})`);
    return body as T;
  }

  async download(path: string) {
    const headers = new Headers();
    if (this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);
    const response = await fetch(`${API_URL}${path}`, { headers });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as ApiError | undefined;
      throw new Error(body?.error?.message ?? `Download failed (${response.status})`);
    }
    return response.blob();
  }

  connect() {
    if (!this.accessToken) throw new Error("Sign in before connecting");
    const encoded = btoa(this.accessToken).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    return new WebSocket(WS_URL, ["libswiftride", `auth.${encoded}`]);
  }
}

export const apiClient = new LibSwiftRideClient();
export const supportedLocales = ["en", "fr"] as const;
export type SupportedLocale = typeof supportedLocales[number];
export const messages = {
  en: { loading: "Loading", empty: "Nothing to show yet", retry: "Try again", pickup: "Pickup", destination: "Destination", payment: "Payment", bookRide: "Book now", getEstimate: "Get estimate", rideStatus: "Ride status" },
  fr: { loading: "Chargement", empty: "Aucun élément à afficher", retry: "Réessayer", pickup: "Lieu de départ", destination: "Destination", payment: "Paiement", bookRide: "Réserver", getEstimate: "Obtenir une estimation", rideStatus: "Statut de la course" }
} as const satisfies Record<SupportedLocale, Record<string, string>>;
export const message = (locale: SupportedLocale, key: keyof typeof messages.en) => messages[locale][key];
export const rideStatusLabel = (status: string, locale: SupportedLocale) => {
  const labels: Record<SupportedLocale, Record<string, string>> = {
    en: { REQUESTED: "Requested", SEARCHING: "Finding a driver", DRIVER_ASSIGNED: "Driver assigned", DRIVER_ARRIVING: "Driver arriving", DRIVER_ARRIVED: "Driver arrived", PASSENGER_BOARDED: "Passenger boarded", IN_PROGRESS: "Trip in progress", COMPLETED: "Completed", CANCELLED: "Cancelled" },
    fr: { REQUESTED: "Demandée", SEARCHING: "Recherche d’un chauffeur", DRIVER_ASSIGNED: "Chauffeur assigné", DRIVER_ARRIVING: "Chauffeur en route", DRIVER_ARRIVED: "Chauffeur arrivé", PASSENGER_BOARDED: "Passager à bord", IN_PROGRESS: "Course en cours", COMPLETED: "Terminée", CANCELLED: "Annulée" }
  };
  return labels[locale][status] ?? status.replaceAll("_", " ");
};
export const money = (minor: number, currency = "LRD", locale: SupportedLocale = "en") =>
  new Intl.NumberFormat(locale === "fr" ? "fr-LR" : "en-LR", { style: "currency", currency }).format(minor / 100);
