import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./styles.css";

export function Shell({ product, children }: { product: string; children: ReactNode }) {
  return <div className="shell">
    <header><a className="brand" href="/">LibSwift<span>Ride</span></a><span className="product">{product}</span></header>
    <main>{children}</main>
    <footer>Built for Liberia · Safety support available 24/7</footer>
  </div>;
}

export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <article className="stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

export function Action({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`action ${className}`} {...props}>{children}</button>;
}

export function Map({ latitude = 6.3156, longitude = -10.8074, label = "Monrovia map" }: { latitude?: number; longitude?: number; label?: string }) {
  const bbox = `${longitude - .04},${latitude - .03},${longitude + .04},${latitude + .03}`;
  return <iframe className="osm-map" title={label} loading="lazy" referrerPolicy="no-referrer"
    src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`} />;
}
