const environment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const API_URL = environment?.VITE_API_URL ?? "http://localhost:4000/api/v1";
const WS_URL = environment?.VITE_WS_URL ?? "ws://localhost:4000/ws";

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export class LibSwiftRideClient {
  constructor(private accessToken = sessionStorage.getItem("lsr_access_token") ?? "") {}

  setAccessToken(token: string) {
    this.accessToken = token;
    sessionStorage.setItem("lsr_access_token", token);
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

  connect() {
    if (!this.accessToken) throw new Error("Sign in before connecting");
    return new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(this.accessToken)}`);
  }
}

export const apiClient = new LibSwiftRideClient();
export const money = (minor: number, currency = "LRD") =>
  new Intl.NumberFormat("en-LR", { style: "currency", currency }).format(minor / 100);
