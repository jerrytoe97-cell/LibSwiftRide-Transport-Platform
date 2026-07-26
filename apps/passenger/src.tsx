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
type Ride = {
  id: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  fareMinor: number;
  requestedAt: string;
  ratings: Array<{ score: number }>;
};
type Notification = { id: string; title: string; body: string; readAt: string | null };

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
  const [rides, setRides] = useState<Ride[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [trackedRideId, setTrackedRideId] = useState<string | null>(null);
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  async function loadDashboard() {
    if (!apiClient.hasSession()) return;
    const [history, inbox] = await Promise.all([
      apiClient.request<{ data: Ride[] }>("/rides?limit=10"),
      apiClient.request<{ data: Notification[]; meta: { unread: number } }>("/notifications?limit=5")
    ]);
    setRides(history.data);
    setNotifications(inbox.data);
    setUnread(inbox.meta.unread);
  }

  useEffect(() => {
    loadDashboard().catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!trackedRideId || !apiClient.hasSession()) return;
    const socket = apiClient.connect();
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "ride.subscribe", rideId: trackedRideId })));
    socket.addEventListener("message", (event) => {
      const update = JSON.parse(event.data) as { type: string; latitude?: number; longitude?: number };
      if (update.type === "driver.location" && update.latitude != null && update.longitude != null) {
        setLiveLocation({ latitude: update.latitude, longitude: update.longitude });
      }
    });
    return () => socket.close();
  }, [trackedRideId]);

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
      setTrackedRideId(response.data.id);
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function rateRide(rideId: string, score: number) {
    try {
      await apiClient.request(`/rides/${rideId}/ratings`, { method: "POST", body: JSON.stringify({ score }) });
      setMessage("Thanks for rating your ride.");
      await loadDashboard();
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
        <Map {...(liveLocation ?? {})} label={liveLocation ? "Live driver location" : "Pickup and destination"} />
      </section>
      <section id="history" className="panel">
        <div className="toolbar"><h2>Your recent rides</h2><span>{unread} unread notifications</span></div>
        <table><thead><tr><th>Route</th><th>Status</th><th>Fare</th><th>Rating</th></tr></thead>
          <tbody>{rides.map((ride) => (
            <tr key={ride.id}>
              <td>{ride.pickupAddress} → {ride.destinationAddress}</td>
              <td><button className="link-button" onClick={() => setTrackedRideId(ride.id)}>{ride.status.replaceAll("_", " ")}</button></td>
              <td>{money(ride.fareMinor)}</td>
              <td>{ride.status === "COMPLETED" && !ride.ratings.length
                ? <span className="rating-actions">{[1, 2, 3, 4, 5].map((score) => <button key={score} onClick={() => rateRide(ride.id, score)} aria-label={`Rate ${score} stars`}>★</button>)}</span>
                : ride.ratings[0]?.score ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rides.length && <p>Sign in to view bookings and receipts.</p>}
      </section>
      <section className="panel">
        <h2>Notifications</h2>
        {notifications.map((notification) => <p key={notification.id}><strong>{notification.title}</strong><br />{notification.body}</p>)}
        {!notifications.length && <p>No new notifications.</p>}
      </section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
