import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import "./styles.css";

type DemoRole = "PASSENGER" | "DRIVER" | "ADMIN" | "DISPATCHER" | "FLEET_MANAGER" | "BUSINESS_MANAGER";
const environment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const demoEnabled = environment?.VITE_DEMO_MODE === "true";
const apiUrl = environment?.VITE_API_URL ?? "http://localhost:4000/api/v1";

const portals = [
  ["Home", "http://localhost:3000"],
  ["Passenger", "http://localhost:3001"],
  ["Driver", "http://localhost:3002"],
  ["Fleet", "http://localhost:3003"],
  ["Admin", "http://localhost:3004"],
  ["Dispatch", "http://localhost:3005"],
  ["Business", "http://localhost:3006"],
] as const;

export function Shell({ product, demoRole, children }: { product: string; demoRole?: DemoRole; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginState, setLoginState] = useState<"idle" | "loading" | "error">("idle");
  const hasSession = typeof sessionStorage !== "undefined" && Boolean(sessionStorage.getItem("lsr_access_token"));

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
    <header className="app-header">
      <a className="brand" href="http://localhost:3000" aria-label="LibSwiftRide home">LibSwift<span>Ride</span></a>
      <span className="product">{product}</span>
      <button className="mobile-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
      <nav className={menuOpen ? "portal-nav open" : "portal-nav"} aria-label="Platform applications">
        {portals.map(([label, href]) => <a key={label} href={href} className={label === product || (label === "Dispatch" && product === "Dispatcher") ? "active" : ""}>{label}</a>)}
      </nav>
      <div className="header-actions">
        <button className="icon-button" aria-label="Notifications">●<span className="notification-dot" /></button>
        {demoEnabled && demoRole && !hasSession
          ? <button className="demo-login" disabled={loginState === "loading"} onClick={demoLogin}>{loginState === "loading" ? "Signing in…" : `Enter ${product} demo`}</button>
          : <span className="profile-chip"><span>{product.slice(0, 1)}</span> Demo {product}</span>}
      </div>
    </header>
    <main id="main-content" tabIndex={-1}>
      {loginState === "error" && <p className="notice error">Demo login failed. Confirm the API is running with DEMO_MODE=true and the demo seed has been applied.</p>}
      {demoEnabled && demoRole && !hasSession && <section className="login-callout"><div><strong>Explore the complete {product.toLowerCase()} experience</strong><p>One click creates a local authenticated demo session—no bearer token required.</p></div><button className="action" onClick={demoLogin}>Launch demo</button></section>}
      {children}
    </main>
    <footer><div><a className="brand inverse" href="http://localhost:3000">LibSwift<span>Ride</span></a><p>Safe, dependable mobility built for Liberia.</p></div><div><strong>Explore</strong>{portals.slice(1).map(([label, href]) => <a key={label} href={href}>{label}</a>)}</div><div><strong>Local demo</strong><span>Payments disabled</span><span>Sandbox notifications</span><span>Monrovia, Liberia</span></div></footer>
  </div>;
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

export function Map({ latitude = 6.3156, longitude = -10.8074, label = "Monrovia map" }: { latitude?: number; longitude?: number; label?: string }) {
  const bbox = `${longitude - .055},${latitude - .04},${longitude + .055},${latitude + .04}`;
  return <div className="map-frame"><iframe className="osm-map" title={label} loading="lazy" referrerPolicy="no-referrer"
    src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`} /><div className="map-overlay"><span className="live-dot" /> Live Monrovia operations</div></div>;
}
