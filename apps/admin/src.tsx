import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Overview = {
  activeRides: number;
  availableDrivers: number;
  completedRides: number;
  grossBookingsMinor: number;
  averageRating: number | null;
};
type PaymentSettings = {
  source: "environment";
  restartRequired: boolean;
  mobileMoney: Array<{
    method: "ORANGE_MONEY" | "MTN_MOMO";
    environmentVariable: string;
    configured: boolean;
  }>;
};

function App() {
  const [data, setData] = useState<Overview>({ activeRides: 0, availableDrivers: 0, completedRides: 0, grossBookingsMinor: 0, averageRating: null });
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiClient.request<{ data: Overview }>("/admin/overview"),
      apiClient.request<{ data: PaymentSettings }>("/admin/settings/payments")
    ]).then(([overview, settings]) => {
      setData(overview.data);
      setPaymentSettings(settings.data);
    }).catch((requestError: Error) => setError(requestError.message));
  }, []);

  return (
    <Shell product="Admin">
      <div className="toolbar">
        <div><span className="eyebrow">Live operations</span><h1>Monrovia at a glance.</h1></div>
        <span>Safety · Payments · Access · Audit</span>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="grid">
        <Stat label="Active rides" value={String(data.activeRides)} />
        <Stat label="Available drivers" value={String(data.availableDrivers)} />
        <Stat label="Gross bookings" value={money(data.grossBookingsMinor)} />
      </div>
      <section className="hero">
        <Map label="Operations map" />
        <div className="panel">
          <h2>Service analytics</h2>
          <table><tbody>
            <tr><th>Completed rides</th><td>{data.completedRides}</td></tr>
            <tr><th>Average rating</th><td>{data.averageRating?.toFixed(2) ?? "—"}</td></tr>
            <tr><th>Platform commission</th><td>12%</td></tr>
            <tr><th>Driver allocation</th><td>88%</td></tr>
          </tbody></table>
          <p>Privileged changes write append-only audit records.</p>
        </div>
      </section>
      <section className="panel">
        <span className="eyebrow">Payment settings</span>
        <h2>Mobile Money destinations</h2>
        <p>Account numbers are deliberately hidden here. Operators change them in the protected deployment environment; no source-code change is required.</p>
        <table><thead><tr><th>Provider</th><th>Environment variable</th><th>Status</th></tr></thead>
          <tbody>{paymentSettings?.mobileMoney.map((setting) => (
            <tr key={setting.method}>
              <td>{setting.method === "ORANGE_MONEY" ? "Orange Money" : "MTN MoMo"}</td>
              <td><code>{setting.environmentVariable}</code></td>
              <td>{setting.configured ? "Configured" : "Not configured"}</td>
            </tr>
          ))}</tbody>
        </table>
        {paymentSettings?.restartRequired && <p className="notice">Restart or redeploy the API after changing an environment value.</p>}
      </section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
