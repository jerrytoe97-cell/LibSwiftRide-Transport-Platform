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

  connect() {
    if (!this.accessToken) throw new Error("Sign in before connecting");
    const encoded = btoa(this.accessToken).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    return new WebSocket(WS_URL, ["libswiftride", `auth.${encoded}`]);
  }
}

export const apiClient = new LibSwiftRideClient();
export const money = (minor: number, currency = "LRD") =>
  new Intl.NumberFormat("en-LR", { style: "currency", currency }).format(minor / 100);
