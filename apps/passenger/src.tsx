import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money, supportedLocales, type SupportedLocale } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Quote = {
  fareMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  driverEarningsMinor: number;
  companyCommissionMinor: number;
  estimatedDurationSec: number;
};
type PaymentMethod = "CASH" | "ORANGE_MONEY" | "MTN_MOMO" | "STRIPE" | "WALLET";
type MobileMoneyDisplay = { method: "ORANGE_MONEY" | "MTN_MOMO"; paymentNumber: string };
type Ride = {
  id: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  fareMinor: number;
  requestedAt: string;
  ratings: Array<{ score: number }>;
  scheduledFor?: string | null;
};
type Notification = { id: string; title: string; body: string; readAt: string | null };
type FavouritePlace = { id: string; type: "HOME" | "WORK" | "CUSTOM"; label: string; address: string; latitude: number; longitude: number };
type ChatMessage = { id: string; senderId: string; content: string; createdAt: string };

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
  const [favourites, setFavourites] = useState<FavouritePlace[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [receipt, setReceipt] = useState<{ receiptNumber: string; fare: { subtotalMinor: number; discountMinor: number; totalMinor: number; currency: string } } | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const trackingSocket = useRef<WebSocket | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>("en");

  async function loadDashboard() {
    if (!apiClient.hasSession()) return;
    const [history, inbox, places, referrals] = await Promise.all([
      apiClient.request<{ data: Ride[] }>("/rides?limit=10"),
      apiClient.request<{ data: Notification[]; meta: { unread: number } }>("/notifications?limit=5"),
      apiClient.request<{ data: FavouritePlace[] }>("/favourite-places"),
      apiClient.request<{ data: { referralCode: string } }>("/referrals/me")
    ]);
    setRides(history.data);
    setNotifications(inbox.data);
    setUnread(inbox.meta.unread);
    setFavourites(places.data);
    setReferralCode(referrals.data.referralCode);
  }

  useEffect(() => {
    loadDashboard().catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  async function changeLocale(nextLocale: SupportedLocale) {
    setLocale(nextLocale);
    if (apiClient.hasSession()) await apiClient.request("/users/me/preferences", { method: "PATCH", body: JSON.stringify({ locale: nextLocale }) });
  }

  useEffect(() => {
    if (!trackedRideId || !apiClient.hasSession()) return;
    const socket = apiClient.connect();
    trackingSocket.current = socket;
    apiClient.request<{ data: ChatMessage[] }>(`/rides/${trackedRideId}/chat`).then((response) => setChatMessages(response.data)).catch(() => setChatMessages([]));
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "ride.subscribe", rideId: trackedRideId })));
    socket.addEventListener("message", (event) => {
      const update = JSON.parse(event.data) as { type: string; latitude?: number; longitude?: number; etaSeconds?: number; id?: string; senderId?: string; content?: string; createdAt?: string };
      if (update.type === "driver.location" && update.latitude != null && update.longitude != null) {
        setLiveLocation({ latitude: update.latitude, longitude: update.longitude });
        setEtaSeconds(update.etaSeconds ?? null);
      }
      if (update.type === "chat.message" && update.id && update.senderId && update.content && update.createdAt) {
        setChatMessages((current) => current.some((message) => message.id === update.id) ? current : [...current, { id: update.id!, senderId: update.senderId!, content: update.content!, createdAt: update.createdAt! }]);
      }
    });
    return () => { trackingSocket.current = null; socket.close(); };
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
        body: JSON.stringify({ ...locations, paymentMethod, promoCode: promo || undefined, scheduledFor: scheduledFor || undefined })
      });
      setMessage(`Ride ${response.data.id.slice(0, 8)} requested. Searching for a nearby driver.`);
      setTrackedRideId(response.data.id);
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function saveFavourite(type: FavouritePlace["type"], label: string, place: typeof locations.pickup) {
    try {
      await apiClient.request("/favourite-places", { method: "POST", body: JSON.stringify({ type, label, ...place }) });
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function loadReceipt(rideId: string) {
    try {
      const response = await apiClient.request<{ data: typeof receipt }>(`/rides/${rideId}/receipt`);
      setReceipt(response.data);
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

  async function transitionRide(rideId: string, status: "PASSENGER_BOARDED" | "CANCELLED") {
    try {
      await apiClient.request(`/rides/${rideId}/transitions`, { method: "POST", body: JSON.stringify({ status, ...(status === "CANCELLED" ? { cancellationReason: "Cancelled by passenger" } : {}) }) });
      await loadDashboard();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function sos(rideId: string) {
    try {
      await apiClient.request(`/rides/${rideId}/sos`, { method: "POST", body: JSON.stringify({ category: "SECURITY", ...(liveLocation ?? {}) }) });
      setMessage("SOS sent to the LibSwiftRide safety team.");
    } catch (error) { setMessage((error as Error).message); }
  }

  async function shareTrip(rideId: string) {
    try {
      const response = await apiClient.request<{ data: { token: string } }>(`/rides/${rideId}/share`, { method: "POST" });
      await navigator.clipboard.writeText(`${window.location.origin}/shared-trip/${response.data.token}`);
      setMessage("Private trip tracking link copied.");
    } catch (error) { setMessage((error as Error).message); }
  }

  function sendChat() {
    if (!trackedRideId || !chatInput.trim() || trackingSocket.current?.readyState !== WebSocket.OPEN) return;
    trackingSocket.current.send(JSON.stringify({ type: "chat.send", rideId: trackedRideId, content: chatInput }));
    setChatInput("");
  }

  async function downloadReceipt(rideId: string) {
    try {
      const blob = await apiClient.download(`/rides/${rideId}/receipt.pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `LibSwiftRide-${rideId.slice(0, 8)}.pdf`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { setMessage((error as Error).message); }
  }

  return (
    <Shell product="Passenger">
      <div className="toolbar">
        <div><span className="eyebrow">Passenger home</span><h1>Where to?</h1></div>
        <label>Language<select aria-label="Language" value={locale} onChange={(event) => changeLocale(event.target.value as SupportedLocale)}>{supportedLocales.map((value) => <option key={value} value={value}>{value === "en" ? "English" : "Français"}</option>)}</select></label>
      </div>
      {message && <p className={message.startsWith("Ride") ? "notice" : "notice error"}>{message}</p>}
      <section className="hero">
        <div className="panel form">
          <label>Pickup<input value={locations.pickup.address} readOnly /></label>
          <label>Destination<input value={locations.destination.address} readOnly /></label>
          <label>Promo code<input value={promo} onChange={(event) => setPromo(event.target.value)} placeholder="Optional" /></label>
          <label>Schedule for later<input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <div className="toolbar">
            <button className="link-button" onClick={() => saveFavourite("HOME", "Home", locations.pickup)}>Save pickup as Home</button>
            <button className="link-button" onClick={() => saveFavourite("WORK", "Work", locations.destination)}>Save destination as Work</button>
          </div>
          <label>
            Payment
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
              <option value="CASH">Cash</option>
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MTN_MOMO">MTN MoMo</option>
              <option value="STRIPE">Stripe</option>
              <option value="WALLET">Wallet</option>
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
              <Stat label="Subtotal" value={money(quote.subtotalMinor)} detail={quote.discountMinor ? `Discount ${money(quote.discountMinor)}` : "No discount"} />
              <Stat label="Driver receives" value={money(quote.driverEarningsMinor)} />
              <Stat label="ETA" value={`${Math.round(quote.estimatedDurationSec / 60)} min`} />
            </div>
          )}
        </div>
        <Map {...(liveLocation ?? {})} label={liveLocation ? `Live driver location${etaSeconds ? ` · ETA ${Math.ceil(etaSeconds / 60)} min` : ""}` : "Pickup and destination"} />
      </section>
      <section id="history" className="panel">
        <div className="toolbar"><h2>Your recent rides</h2><span>{unread} unread notifications</span></div>
        <table><thead><tr><th>Route</th><th>Status</th><th>Fare</th><th>Rating</th><th>Receipt</th></tr></thead>
          <tbody>{rides.map((ride) => (
            <tr key={ride.id}>
              <td>{ride.pickupAddress} → {ride.destinationAddress}</td>
              <td><button className="link-button" onClick={() => setTrackedRideId(ride.id)}>{ride.status.replaceAll("_", " ")}</button>
                {ride.status === "DRIVER_ARRIVED" && <button className="link-button" onClick={() => transitionRide(ride.id, "PASSENGER_BOARDED")}>I have boarded</button>}
                {!["COMPLETED", "CANCELLED"].includes(ride.status) && <><button className="link-button" onClick={() => shareTrip(ride.id)}>Share</button><button onClick={() => sos(ride.id)}>SOS</button><button className="link-button" onClick={() => transitionRide(ride.id, "CANCELLED")}>Cancel</button></>}
              </td>
              <td>{money(ride.fareMinor)}</td>
              <td>{ride.status === "COMPLETED" && !ride.ratings.length
                ? <span className="rating-actions">{[1, 2, 3, 4, 5].map((score) => <button key={score} onClick={() => rateRide(ride.id, score)} aria-label={`Rate ${score} stars`}>★</button>)}</span>
                : ride.ratings[0]?.score ?? "—"}</td>
              <td>{ride.status === "COMPLETED" && <><button className="link-button" onClick={() => loadReceipt(ride.id)}>View</button> · <button className="link-button" onClick={() => downloadReceipt(ride.id)}>PDF</button></>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rides.length && <p>Sign in to view bookings and receipts.</p>}
      </section>
      {trackedRideId && <section className="panel" aria-live="polite">
        <h2>Ride chat</h2>
        <div>{chatMessages.map((chat) => <p key={chat.id}>{chat.content}<br /><small>{new Date(chat.createdAt).toLocaleTimeString("en-LR")}</small></p>)}</div>
        <div className="form-row"><label>Message<input value={chatInput} maxLength={500} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendChat(); }} /></label><button className="action" onClick={sendChat}>Send</button></div>
      </section>}
      <section className="panel"><h2>Invite and earn</h2><p>Share referral code <strong>{referralCode || "Sign in to view your code"}</strong>. Rewards are issued after the referred passenger completes their first ride.</p></section>
      <section className="panel">
        <h2>Favourite places</h2>
        {favourites.map((place) => <p key={place.id}><strong>{place.label}</strong> · {place.address}</p>)}
        {receipt && <div className="notice"><strong>{receipt.receiptNumber}</strong> · Total {money(receipt.fare.totalMinor, receipt.fare.currency)} · Discount {money(receipt.fare.discountMinor, receipt.fare.currency)}</div>}
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
