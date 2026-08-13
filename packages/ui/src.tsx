import { useEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import { apiClient, registerWebPushDevice } from "@libswiftride/sdk";
import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ThemeMode } from "./theme/index.js";
import "./styles.css";

type DemoRole = "PASSENGER" | "DRIVER" | "ADMIN" | "DISPATCHER" | "FLEET_MANAGER" | "BUSINESS_MANAGER";
type Profile = {
  id: string;
  phone: string;
  email: string | null;
  emailVerifiedAt: string | null;
  firstName: string;
  lastName: string;
  role: DemoRole | "SUPPORT";
  status: string;
  locale: "en" | "fr";
};
type Session = { id: string; createdAt: string; expiresAt: string };
const environment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const demoEnabled = environment?.VITE_DEMO_MODE === "true";
const pushConfigured = Boolean(environment?.VITE_WEB_PUSH_PUBLIC_KEY?.trim());
const apiUrl = environment?.VITE_API_URL ?? "http://localhost:4000/api/v1";
const requestedMapProvider = environment?.VITE_MAP_PROVIDER?.trim().toLowerCase() || "preview";
const configuredMapboxToken = environment?.VITE_MAPBOX_ACCESS_TOKEN?.trim();
const mapboxAccessToken = requestedMapProvider === "mapbox" && configuredMapboxToken?.startsWith("pk.") ? configuredMapboxToken : undefined;
const brandLogoUrl = new URL("./assets/libswiftride-logo.png", import.meta.url).href;

function initialNetworkOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(initialNetworkOnline);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);

  return online;
}

function NetworkNotice() {
  const online = useNetworkStatus();
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    try {
      const healthUrl = `${apiUrl.replace(/\/api\/v1\/?$/, "")}/health/live`;
      const response = await fetch(healthUrl, { cache: "no-store" });
      if (response.ok) window.dispatchEvent(new Event("online"));
    } catch {
      // The persistent notice remains visible when the connection is unavailable.
    } finally {
      setChecking(false);
    }
  }

  if (online) return null;
  return <div className="network-notice" role="alert">
    <div><strong>You are offline</strong><span>Live maps, booking, GPS sharing and account changes are paused. Your current screen remains available.</span></div>
    <button type="button" disabled={checking} onClick={() => void retry()}>{checking ? "Checking connection…" : "Try connection again"}</button>
  </div>;
}

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem("lsr_theme");
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function ThemeToggle() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(initialTheme);
  const nextMode: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };
  const labels: Record<ThemeMode, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };

  useEffect(() => {
    if (themeMode === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("lsr_theme", themeMode);
  }, [themeMode]);

  return <button className="theme-toggle" type="button" aria-label={`${labels[themeMode]}. Switch theme.`}
    title={`${labels[themeMode]} · select ${labels[nextMode[themeMode]]}`}
    onClick={() => setThemeMode(nextMode[themeMode])}>
    <span aria-hidden="true">{themeMode === "dark" ? "☾" : themeMode === "light" ? "☀" : "◐"}</span>
  </button>;
}

const portalUrls = {
  web: environment?.VITE_WEB_URL ?? "http://localhost:3000",
  passenger: environment?.VITE_PASSENGER_APP_URL ?? "http://localhost:3001",
  driver: environment?.VITE_DRIVER_APP_URL ?? "http://localhost:3002",
  fleet: environment?.VITE_FLEET_APP_URL ?? "http://localhost:3003",
  admin: environment?.VITE_ADMIN_APP_URL ?? "http://localhost:3004",
  dispatcher: environment?.VITE_DISPATCHER_APP_URL ?? "http://localhost:3005",
  business: environment?.VITE_BUSINESS_APP_URL ?? "http://localhost:3006",
};

const portals = [
  ["Home", portalUrls.web],
  ["Passenger", portalUrls.passenger],
  ["Driver", portalUrls.driver],
  ["Fleet", portalUrls.fleet],
  ["Admin", portalUrls.admin],
  ["Dispatch", portalUrls.dispatcher],
  ["Business", portalUrls.business],
] as const;

export function Shell({ product, demoRole, children }: { product: string; demoRole?: DemoRole; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginState, setLoginState] = useState<"idle" | "loading" | "error">("idle");
  const [hasSession, setHasSession] = useState(() => apiClient.hasSession());
  const [accountOpen, setAccountOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [accountError, setAccountError] = useState("");
  const [pushState, setPushState] = useState<"idle" | "loading" | "enabled" | "error">("idle");

  async function enableNotifications() {
    setPushState("loading");
    try {
      await registerWebPushDevice();
      setPushState("enabled");
    } catch {
      setPushState("error");
    }
  }

  useEffect(() => {
    const update = () => setHasSession(apiClient.hasSession());
    window.addEventListener("lsr-session-changed", update);
    apiClient.restoreSession().then(update);
    return () => window.removeEventListener("lsr-session-changed", update);
  }, []);

  useEffect(() => {
    if (!hasSession || !accountOpen) return;
    Promise.all([
      apiClient.request<{ data: Profile }>("/users/me"),
      apiClient.request<{ data: Session[] }>("/auth/sessions")
    ]).then(([profileResponse, sessionResponse]) => {
      setProfile(profileResponse.data);
      setSessions(sessionResponse.data);
      setAccountError("");
    }).catch((error: Error) => setAccountError(error.message));
  }, [hasSession, accountOpen]);

  async function demoLogin() {
    if (!demoRole) return;
    setLoginState("loading");
    try {
      const response = await fetch(`${apiUrl}/auth/demo-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: demoRole }),
      });
      const result = await response.json() as { tokens?: { accessToken: string; refreshToken: string }; error?: { message: string } };
      if (!response.ok || !result.tokens) throw new Error(result.error?.message ?? "Demo login failed");
      sessionStorage.setItem("lsr_access_token", result.tokens.accessToken);
      sessionStorage.setItem("lsr_refresh_token", result.tokens.refreshToken);
      window.location.reload();
    } catch {
      setLoginState("error");
    }
  }

  return <div className="shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    {demoEnabled && <div className="demo-banner" role="status"><span>◆</span> Demo Environment <small>Fictional data · sandbox services · payments disabled</small></div>}
    <NetworkNotice />
    <header className="app-header">
      <a className="brand" href={portalUrls.web} aria-label="LibSwiftRide home"><img className="brand-logo" src={brandLogoUrl} alt="" />LibSwift<span>Ride</span></a>
      <span className="product">{product}</span>
      <button className="mobile-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
      <nav className={menuOpen ? "portal-nav open" : "portal-nav"} aria-label="Platform applications">
        {portals.map(([label, href]) => <a key={label} href={href} className={label === product || (label === "Dispatch" && product === "Dispatcher") ? "active" : ""}>{label}</a>)}
      </nav>
      <div className="header-actions">
        <ThemeToggle />
        <button className="icon-button" aria-label="Notifications">●<span className="notification-dot" /></button>
        {pushConfigured && hasSession && <button className="demo-login" type="button" disabled={pushState === "loading" || pushState === "enabled"} onClick={enableNotifications}>{pushState === "loading" ? "Enablingâ€¦" : pushState === "enabled" ? "Notifications on" : "Enable notifications"}</button>}
        {demoEnabled && demoRole && !hasSession
          ? <button className="demo-login" disabled={loginState === "loading"} onClick={demoLogin}>{loginState === "loading" ? "Signing in…" : `Enter ${product} demo`}</button>
          : hasSession
            ? <button className="profile-chip" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}><span>{profile?.firstName?.slice(0, 1) ?? product.slice(0, 1)}</span>{profile ? profile.firstName : "Account"}</button>
            : null}
      </div>
    </header>
    <main id="main-content" tabIndex={-1}>
      {loginState === "error" && <p className="notice error">Demo login failed. Confirm the API is running with DEMO_MODE=true and the demo seed has been applied.</p>}
      {pushState === "enabled" && <p className="notice" role="status">Push notifications are enabled on this device.</p>}
      {pushState === "error" && <p className="notice error" role="alert">Push notifications could not be enabled. Check browser permission settings and try again.</p>}
      {demoEnabled && demoRole && !hasSession && <section className="login-callout"><div><strong>Explore the complete {product.toLowerCase()} experience</strong><p>One click creates a local authenticated demo session—no bearer token required.</p></div><button className="action" onClick={demoLogin}>Launch demo</button></section>}
      {demoRole && !hasSession
        ? <AuthenticationPanel product={product} role={demoRole} onAuthenticated={() => { setHasSession(true); window.location.reload(); }} onDemo={demoEnabled ? demoLogin : undefined} />
        : children}
      {accountOpen && hasSession && <AccountPanel profile={profile} sessions={sessions} error={accountError}
        onClose={() => setAccountOpen(false)}
        onProfile={(next) => setProfile(next)}
        onSessions={(next) => setSessions(next)}
        onError={setAccountError} />}
    </main>
    <footer className="app-footer"><div><a className="brand inverse" href={portalUrls.web}><img className="brand-logo" src={brandLogoUrl} alt="LibSwiftRide official logo" loading="lazy" />LibSwift<span>Ride</span></a><p>Safe, dependable mobility built for Liberia.</p></div><div><strong>Explore</strong>{portals.slice(1).map(([label, href]) => <a key={label} href={href}>{label}</a>)}</div><div><strong>Local demo</strong><span>Payments disabled</span><span>Sandbox notifications</span><span>Monrovia, Liberia</span></div></footer>
  </div>;
}

function AuthenticationPanel({ product, role, onAuthenticated, onDemo }: { product: string; role: DemoRole; onAuthenticated: () => void; onDemo?: (() => Promise<void>) | undefined }) {
  const canRegister = role === "PASSENGER" || role === "DRIVER";
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "forgot") {
        await apiClient.request("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email: String(data.get("email") ?? "").trim() }), skipAuthRefresh: true });
        setNotice("If that email belongs to an account, reset instructions have been sent. The link expires in one hour.");
        setMode("reset");
        return;
      }
      if (mode === "reset") {
        const password = String(data.get("password") ?? "");
        if (password !== String(data.get("passwordConfirmation") ?? "")) throw new Error("The new passwords do not match.");
        await apiClient.request("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token: String(data.get("token") ?? "").trim(), password }), skipAuthRefresh: true });
        setNotice("Your password has been reset and all previous sessions were signed out. Sign in with your new password.");
        setMode("login");
        return;
      }
      if (mode === "register") {
        const email = String(data.get("email") ?? "");
        await apiClient.register({
          phone: String(data.get("phone") ?? ""),
          password: String(data.get("password") ?? ""),
          firstName: String(data.get("firstName") ?? ""),
          lastName: String(data.get("lastName") ?? ""),
          role: role as "PASSENGER" | "DRIVER",
          ...(email ? { email } : {})
        }, data.get("remember") === "on");
        const emergencyName = String(data.get("emergencyName") ?? "").trim();
        const emergencyPhone = String(data.get("emergencyPhone") ?? "").trim();
        if (role === "PASSENGER" && emergencyName && emergencyPhone) {
          await apiClient.request("/safety/emergency-contacts", {
            method: "POST",
            body: JSON.stringify({
              name: emergencyName,
              phone: emergencyPhone,
              relationship: String(data.get("emergencyRelationship") ?? "Emergency contact")
            })
          });
        }
      } else {
        await apiClient.login(String(data.get("phone") ?? ""), String(data.get("password") ?? ""), data.get("remember") === "on");
      }
      const response = await apiClient.request<{ data: Profile }>("/users/me");
      if (response.data.role !== role) {
        await apiClient.logout();
        throw new Error(`This account cannot access the ${product.toLowerCase()} portal.`);
      }
      onAuthenticated();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "login" ? `Sign in to ${product}` : mode === "register" ? `Create your ${product.toLowerCase()} account` : mode === "forgot" ? "Recover your account" : "Choose a new password";
  const description = mode === "login" ? "Protected sessions, role-based access and account activity controls are built in." : mode === "forgot" ? "Enter the email on your account. For your privacy, the response is the same whether or not an account exists." : mode === "reset" ? "Paste the reset token from your email and choose a new password. Completing this step signs out every previous session." : role === "PASSENGER" ? "Create your profile, add a trusted emergency contact and prepare your saved places. Phone verification is required before live rides." : "Create your account, then complete driver and vehicle verification before going online.";
  return <section className="auth-shell" aria-labelledby="auth-title">
    <div className="auth-intro"><span className="eyebrow">Secure account access</span><h1 id="auth-title">{title}</h1><p>{description}</p></div>
    <form className="auth-card" onSubmit={submit}>
      {notice && <p className="notice" role="status">{notice}</p>}
      {mode === "forgot" && <label>Email address<input name="email" type="email" autoComplete="email" required /></label>}
      {mode === "reset" && <><label>Reset token<input name="token" autoComplete="one-time-code" required minLength={32} /></label><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label><label>Confirm new password<input name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label></>}
      {(mode === "login" || mode === "register") && <>
      {mode === "register" && <div className="form-row"><label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label><label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} /></label></div>}
      <label>Mobile number<input name="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={20} placeholder="e.g. 0770000000" /></label>
      {mode === "register" && <p className="verification-hint"><strong>Phone verification</strong><span>We will send a one-time code after account creation. Never share this code with a driver or support agent.</span></p>}
      {mode === "register" && <label>Email address<input name="email" type="email" autoComplete="email" /></label>}
      {mode === "register" && role === "PASSENGER" && <>
        <label>Profile photo <span className="optional-label">Optional</span><input name="profilePhoto" type="file" accept="image/jpeg,image/png" /></label>
        <fieldset className="auth-fieldset"><legend>Emergency contact</legend>
          <div className="form-row"><label>Full name<input name="emergencyName" maxLength={120} /></label><label>Phone number<input name="emergencyPhone" type="tel" maxLength={20} /></label></div>
          <label>Relationship<input name="emergencyRelationship" maxLength={80} placeholder="e.g. Parent, spouse, friend" /></label>
        </fieldset>
        <fieldset className="auth-fieldset"><legend>Saved locations</legend>
          <label>Home<input name="homeAddress" autoComplete="street-address" placeholder="Add after phone verification" /></label>
          <label>Work<input name="workAddress" placeholder="Add after phone verification" /></label>
          <label>Favorite place<input name="favoriteAddress" placeholder="Optional" /></label>
        </fieldset>
        <p className="privacy-hint">Profile photos and saved places are completed after verification so they can use protected upload and location services.</p>
      </>}
      <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={12} maxLength={128} /></label>
      <label className="check-row"><input name="remember" type="checkbox" defaultChecked /> Keep me signed in on this device</label>
      </>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="action" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in securely" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset instructions" : "Reset password"}</button>
      {canRegister && (mode === "login" || mode === "register") && <button className="link-button" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setNotice(""); }}>{mode === "login" ? "New to LibSwiftRide? Create an account" : "Already registered? Sign in"}</button>}
      {onDemo && mode === "login" && <button className="action secondary" type="button" disabled={busy} onClick={() => void onDemo()}>Continue with demo</button>}
      {mode === "login" && <button className="link-button auth-help" type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Forgot your password?</button>}
      {(mode === "forgot" || mode === "reset") && <div className="auth-recovery-actions"><button className="link-button" type="button" onClick={() => { setMode("login"); setError(""); }}>Back to sign in</button>{mode === "forgot" && <button className="link-button" type="button" onClick={() => { setMode("reset"); setError(""); }}>I already have a reset token</button>}</div>}
    </form>
  </section>;
}

function AccountPanel({ profile, sessions, error, onClose, onProfile, onSessions, onError }: {
  profile: Profile | null;
  sessions: Session[];
  error: string;
  onClose: () => void;
  onProfile: (profile: Profile) => void;
  onSessions: (sessions: Session[]) => void;
  onError: (message: string) => void;
}) {
  const [verificationState, setVerificationState] = useState<"idle" | "sending" | "sent" | "confirming">("idle");
  const [verificationToken, setVerificationToken] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiClient.request<{ data: Profile }>("/users/me", { method: "PATCH", body: JSON.stringify({ firstName: data.get("firstName"), lastName: data.get("lastName"), email: data.get("email") || null, locale: data.get("locale") }) });
      onProfile(response.data);
      onError("");
    } catch (requestError) { onError((requestError as Error).message); }
  }

  async function revoke(id: string) {
    try {
      await apiClient.request(`/auth/sessions/${id}`, { method: "DELETE" });
      onSessions(sessions.filter((session) => session.id !== id));
    } catch (requestError) { onError((requestError as Error).message); }
  }

  async function requestEmailVerification() {
    setVerificationState("sending");
    try {
      await apiClient.request("/auth/email-verification/request", { method: "POST" });
      setVerificationState("sent");
      onError("");
    } catch (requestError) { setVerificationState("idle"); onError((requestError as Error).message); }
  }

  async function confirmEmailVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerificationState("confirming");
    try {
      await apiClient.request("/auth/email-verification/confirm", { method: "POST", body: JSON.stringify({ token: verificationToken.trim() }), skipAuthRefresh: true });
      const response = await apiClient.request<{ data: Profile }>("/users/me");
      onProfile(response.data);
      setVerificationToken("");
      setVerificationState("idle");
      onError("");
    } catch (requestError) { setVerificationState("sent"); onError((requestError as Error).message); }
  }

  return <aside className="account-drawer" aria-label="Account and security settings">
    <div className="toolbar"><div><span className="eyebrow">Account</span><h2>Profile & security</h2></div><button className="link-button" onClick={onClose}>Close</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!profile ? <p>Loading account…</p> : <form onSubmit={save}>
      <div className="form-row"><label>First name<input name="firstName" defaultValue={profile.firstName} required /></label><label>Last name<input name="lastName" defaultValue={profile.lastName} required /></label></div>
      <label>Email<input name="email" type="email" defaultValue={profile.email ?? ""} /></label>
      <label>Language<select name="locale" defaultValue={profile.locale}><option value="en">English</option><option value="fr">Français</option></select></label>
      <p><strong>{profile.phone}</strong><br /><small>{profile.role.replaceAll("_", " ")} · {profile.emailVerifiedAt ? "Email verified" : "Email verification pending"}</small></p>
      <button className="action">Save profile</button>
    </form>}
    {profile?.email && !profile.emailVerifiedAt && <section className="account-verification" aria-labelledby="email-verification-title"><h3 id="email-verification-title">Verify email</h3><p>Verify {profile.email} to use account recovery and receive security notices.</p><button className="action secondary" type="button" disabled={verificationState === "sending" || verificationState === "confirming"} onClick={() => void requestEmailVerification()}>{verificationState === "sending" ? "Sending…" : verificationState === "sent" || verificationState === "confirming" ? "Send another code" : "Send verification code"}</button>{(verificationState === "sent" || verificationState === "confirming") && <form onSubmit={confirmEmailVerification}><label>Verification token<input value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} autoComplete="one-time-code" minLength={32} required /></label><button className="action" disabled={verificationState === "confirming"}>{verificationState === "confirming" ? "Verifying…" : "Verify email"}</button></form>}</section>}
    <div className="account-sessions"><h3>Active sessions</h3>{sessions.length ? sessions.map((session) => <div className="mini-row" key={session.id}><span>Signed in {new Date(session.createdAt).toLocaleDateString()}<small>Expires {new Date(session.expiresAt).toLocaleDateString()}</small></span><button className="link-button" onClick={() => revoke(session.id)}>Revoke</button></div>) : <p>No other active sessions.</p>}</div>
    <button className="danger-button" onClick={() => apiClient.logout().finally(() => window.location.reload())}>Sign out of this device</button>
  </aside>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function SectionNav({ items }: { items: string[] }) {
  return <nav className="section-nav" aria-label="Page sections">{items.map((item, index) => <a key={item} href={`#section-${index}`}>{item}</a>)}</nav>;
}

export function StatusBadge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "gray" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Stat({ label, value, detail, trend }: { label: string; value: string; detail?: string; trend?: string }) {
  return <article className="stat" aria-label={`${label}: ${value}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}{trend && <em>{trend}</em>}</article>;
}

export function Action({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`action ${className}`} {...props}>{children}</button>;
}

type MapPoint = { latitude: number; longitude: number; label?: string };
type MapController = {
  fitBounds: (bounds: [[number, number], [number, number]], options: { padding: number; duration: number; maxZoom: number }) => unknown;
  easeTo: (options: { center: [number, number]; duration: number }) => unknown;
  isStyleLoaded: () => boolean;
  once: (type: "load", listener: () => void) => unknown;
  getSource: (id: string) => unknown;
  getLayer: (id: string) => unknown;
  addSource: (id: string, source: { type: "geojson"; data: object }) => unknown;
  addLayer: (layer: object) => unknown;
  removeLayer: (id: string) => unknown;
  removeSource: (id: string) => unknown;
  remove: () => void;
};
type MapMarker = { remove: () => void };

export function Map({ latitude = 6.3156, longitude = -10.8074, label = "Monrovia map", pickup, destination, drivers = [], route = [] }: {
  latitude?: number;
  longitude?: number;
  label?: string;
  pickup?: MapPoint;
  destination?: MapPoint;
  drivers?: MapPoint[];
  route?: Array<[number, number]>;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapController | null>(null);
  const markers = useRef<MapMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    let disposed = false;
    const initialize = async () => {
      if (mapboxAccessToken) {
        const { default: mapboxgl } = await import("mapbox-gl");
        if (disposed || !container.current) return;
        const instance = new mapboxgl.Map({ accessToken: mapboxAccessToken, container: container.current, style: "mapbox://styles/mapbox/streets-v12", center: [longitude, latitude], zoom: 13 });
        instance.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
        map.current = instance as unknown as MapController;
      } else {
        const maplibreModule = await import("maplibre-gl");
        const maplibregl = "Map" in maplibreModule ? maplibreModule : (maplibreModule as unknown as { default: typeof maplibreModule }).default;
        if (disposed || !container.current) return;
        const instance = new maplibregl.Map({ container: container.current, style: "https://demotiles.maplibre.org/style.json", center: [longitude, latitude], zoom: 13 });
        instance.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
        map.current = instance as unknown as MapController;
      }
      setMapReady(true);
    };
    void initialize();
    return () => {
      disposed = true;
      markers.current.forEach((current) => current.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const currentMap = map.current;
    const points = [
      ...(pickup ? [{ ...pickup, color: "#0c2454" }] : []),
      ...(destination ? [{ ...destination, color: "#bc2c24" }] : []),
      ...drivers.map((driver) => ({ ...driver, color: "#15803d" })),
      ...(!pickup && !destination && !drivers.length ? [{ latitude, longitude, color: "#bc2c24", label }] : [])
    ];
    let cancelled = false;
    const render = async () => {
      if (cancelled) return;
      markers.current.forEach((current) => current.remove());
      if (mapboxAccessToken) {
        const { default: mapboxgl } = await import("mapbox-gl");
        markers.current = points.map((point) => {
          const marker = new mapboxgl.Marker({ color: point.color }).setLngLat([point.longitude, point.latitude]);
          if (point.label) marker.setPopup(new mapboxgl.Popup({ offset: 18 }).setText(point.label));
          return marker.addTo(currentMap as unknown as import("mapbox-gl").Map);
        });
      } else {
        const maplibreModule = await import("maplibre-gl");
        const maplibregl = "Map" in maplibreModule ? maplibreModule : (maplibreModule as unknown as { default: typeof maplibreModule }).default;
        markers.current = points.map((point) => {
          const marker = new maplibregl.Marker({ color: point.color }).setLngLat([point.longitude, point.latitude]);
          if (point.label) marker.setPopup(new maplibregl.Popup({ offset: 18 }).setText(point.label));
          return marker.addTo(currentMap as unknown as import("maplibre-gl").Map);
        });
      }
      if (pickup && destination && route.length >= 2) {
        const routeData = {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: route }
        };
        const drawRoute = () => {
          if (cancelled) return;
          const existingRoute = currentMap.getSource("trip-route") as { setData?: (data: object) => void } | undefined;
          if (existingRoute?.setData) existingRoute.setData(routeData);
          else {
            currentMap.addSource("trip-route", { type: "geojson", data: routeData });
            currentMap.addLayer({ id: "trip-route-line", type: "line", source: "trip-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#0c2454", "line-width": 5, "line-opacity": 0.82 } });
          }
        };
        if (currentMap.isStyleLoaded()) drawRoute();
        else currentMap.once("load", drawRoute);
      } else if (currentMap.isStyleLoaded()) {
        if (currentMap.getLayer("trip-route-line")) currentMap.removeLayer("trip-route-line");
        if (currentMap.getSource("trip-route")) currentMap.removeSource("trip-route");
      }
      if (points.length > 1) {
        const longitudes = points.map((point) => point.longitude);
        const latitudes = points.map((point) => point.latitude);
        currentMap.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 70, duration: 600, maxZoom: 14 });
      } else currentMap.easeTo({ center: [longitude, latitude], duration: 600 });
    };
    void render();
    return () => { cancelled = true; };
  }, [mapReady, latitude, longitude, pickup?.latitude, pickup?.longitude, destination?.latitude, destination?.longitude, drivers, route]);

  return <div className="map-frame" aria-label={label}>
    <div className="mapbox-map" ref={container} />
    <div className="map-overlay"><span className="live-dot" /> {label}<small>{mapboxAccessToken ? "Mapbox" : "OpenStreetMap preview"}</small></div>
  </div>;
}
