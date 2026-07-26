import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Quote = {
  fareMinor: number;
  driverEarningsMinor: number;
  companyCommissionMinor: number;
  estimatedDurationSec: number;
};
type PaymentMethod = "CASH" | "ORANGE_MONEY" | "MTN_MOMO" | "STRIPE";
type MobileMoneyDisplay = { method: "ORANGE_MONEY" | "MTN_MOMO"; paymentNumber: string };

const locations = {
  pickup: { address: "Broad Street, Monrovia", latitude: 6.3156, longitude: -10.8074 },
  destination: { address: "Samuel K. Doe Sports Complex", latitude: 6.3058, longitude: -10.7492 }
};

function App() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState("");
  const [promo, setPromo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [mobileMoney, setMobileMoney] = useState<MobileMoneyDisplay | null>(null);

  useEffect(() => {
    if (paymentMethod !== "ORANGE_MONEY" && paymentMethod !== "MTN_MOMO") {
      setMobileMoney(null);
      return;
    }
    setMobileMoney(null);
    apiClient.request<{ data: MobileMoneyDisplay }>(`/payments/mobile-money/${paymentMethod}/display`)
      .then((response) => setMobileMoney(response.data))
      .catch((error: Error) => setMessage(error.message));
  }, [paymentMethod]);

  async function getQuote() {
    try {
      const response = await apiClient.request<{ data: Quote }>("/rides/quote", {
        method: "POST",
        body: JSON.stringify({ ...locations, promoCode: promo || undefined })
      });
      setQuote(response.data);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function book() {
    try {
      const response = await apiClient.request<{ data: { id: string } }>("/rides", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ ...locations, paymentMethod, promoCode: promo || undefined })
      });
      setMessage(`Ride ${response.data.id.slice(0, 8)} requested. Searching for a nearby driver.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <Shell product="Passenger">
      <div className="toolbar">
        <div><span className="eyebrow">Passenger home</span><h1>Where to?</h1></div>
        <a href="#history">Ride history</a>
      </div>
      {message && <p className={message.startsWith("Ride") ? "notice" : "notice error"}>{message}</p>}
      <section className="hero">
        <div className="panel form">
          <label>Pickup<input value={locations.pickup.address} readOnly /></label>
          <label>Destination<input value={locations.destination.address} readOnly /></label>
          <label>Promo code<input value={promo} onChange={(event) => setPromo(event.target.value)} placeholder="Optional" /></label>
          <label>
            Payment
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
              <option value="CASH">Cash</option>
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MTN_MOMO">MTN MoMo</option>
              <option value="STRIPE">Stripe</option>
            </select>
          </label>
          {mobileMoney && (
            <div className="notice" role="status">
              Send payment to <strong>{mobileMoney.paymentNumber}</strong> using {mobileMoney.method === "ORANGE_MONEY" ? "Orange Money" : "MTN MoMo"}.
              Confirm the recipient name before sending.
            </div>
          )}
          <div className="toolbar">
            <button className="action" onClick={getQuote}>Get estimate</button>
            {quote && <button className="action" onClick={book}>Book now</button>}
          </div>
          {quote && (
            <div className="grid">
              <Stat label="Fare" value={money(quote.fareMinor)} />
              <Stat label="Driver receives" value={money(quote.driverEarningsMinor)} />
              <Stat label="ETA" value={`${Math.round(quote.estimatedDurationSec / 60)} min`} />
            </div>
          )}
        </div>
        <Map />
      </section>
      <section id="history"><h2>Your recent rides</h2><p>Authenticated ride history, receipts and ratings load from the ride history API.</p></section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
