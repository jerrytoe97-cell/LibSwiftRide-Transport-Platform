import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApiRequestError, apiClient, message as translatedMessage, money, passengerMessage, rideStatusLabel, supportedLocales, type SupportedLocale } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Quote = {
  fareMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  driverEarningsMinor: number;
  companyCommissionMinor: number;
  estimatedDistanceM: number;
  estimatedDurationSec: number;
  rideType: "ECONOMY";
  route: { geometry: Array<[number, number]> };
};
type PaymentMethod = "CASH" | "ORANGE_MONEY" | "MTN_MOMO" | "STRIPE" | "WALLET";
type MobileMoneyDisplay = { method: "ORANGE_MONEY" | "MTN_MOMO"; paymentNumber: string };
type Ride = {
  id: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  fareMinor: number;
  paymentMethod: PaymentMethod;
  requestedAt: string;
  ratings?: Array<{ score: number }>;
  scheduledFor?: string | null;
  payment?: { status: string; method: string } | null;
  driver?: {
    user: { firstName: string; lastName: string };
    vehicle: { make: string; model: string; color: string; plateNumber: string } | null;
    rating: { average: number | null; count: number };
  } | null;
};
type Notification = { id: string; title: string; body: string; readAt: string | null };
type FavouritePlace = { id: string; type: "HOME" | "WORK" | "CUSTOM"; label: string; address: string; latitude: number; longitude: number };
type ChatMessage = { id: string; senderId: string; content: string; createdAt: string };
type RidePass = { id: string; ridesRemaining: number; expiresAt: string; status: string; product: { name: string } };
type Delivery = { id: string; status: string; pickupAddress: string; dropoffAddress: string; fareMinor: number };
type ReferralReward = { id: string; status: string; rewardMinor: number; qualifiedAt: string | null; rewardedAt: string | null; createdAt: string };
type Wallet = { balanceMinor: number; currency: string; transactions: Array<{ id: string; type: string; amountMinor: number; description: string; createdAt: string }> };
type ActivePromotion = { code: string; description: string; percentageOff: number | null; amountOffMinor: number | null; maxDiscountMinor: number | null; minimumFareMinor: number; expiresAt: string };
type TrackingResponse = { rideId: string; status: string; current: { latitude: number; longitude: number; at: string } | null; remainingDistanceM: number | null; etaSeconds: number | null };
type Receipt = {
  receiptNumber: string; rideId: string; completedAt: string | null;
  route: { pickup: string; destination: string };
  fare: { subtotalMinor: number; baseFareMinor: number; dynamicMultiplierBps: number; waitingTimeSec: number; waitingFeeMinor: number; tollMinor: number; discountMinor: number; totalMinor: number; refundedMinor: number; driverEarningsMinor: number; companyCommissionMinor: number; currency: string };
  payment: { method: string; status: string };
  promoCode: string | null;
  driver: { name: string; vehicle: { make: string; model: string; plateNumber: string } | null } | null;
};

type Location = { address: string; latitude: number; longitude: number };
type RideOption = "ECONOMY" | "PREMIUM" | "BUSINESS";
type SosCategory = "MEDICAL" | "SECURITY" | "CRASH" | "HARASSMENT" | "OTHER";
const defaultLocations = {
  pickup: { address: "Broad Street, Monrovia", latitude: 6.3156, longitude: -10.8074 },
  destination: { address: "Samuel K. Doe Sports Complex, Paynesville", latitude: 6.25694, longitude: -10.70213 }
};

function App() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState("");
  const [promo, setPromo] = useState("");
  const [activePromotions, setActivePromotions] = useState<ActivePromotion[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [mobileMoney, setMobileMoney] = useState<MobileMoneyDisplay | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [trackedRideId, setTrackedRideId] = useState<string | null>(null);
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<"idle" | "connecting" | "live" | "reconnecting">("idle");
  const [favourites, setFavourites] = useState<FavouritePlace[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralRewards, setReferralRewards] = useState<ReferralReward[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const trackingSocket = useRef<WebSocket | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>("en");
  const [ridePasses, setRidePasses] = useState<RidePass[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [pickup, setPickup] = useState<Location>(defaultLocations.pickup);
  const [destination, setDestination] = useState<Location>(defaultLocations.destination);
  const [locating, setLocating] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelRideId, setCancelRideId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("Plans changed");
  const [cancelling, setCancelling] = useState(false);
  const [sosRideId, setSosRideId] = useState<string | null>(null);
  const [sosCategory, setSosCategory] = useState<SosCategory>("SECURITY");
  const [sosNote, setSosNote] = useState("");
  const [sosSending, setSosSending] = useState(false);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [rideOption, setRideOption] = useState<RideOption>("ECONOMY");
  const locations = { pickup, destination };

  async function loadDashboard() {
    if (!apiClient.hasSession()) return;
    const [history, inbox, places, referrals, passes, deliveryHistory, passengerWallet, promotions] = await Promise.all([
      apiClient.request<{ data: Ride[] }>("/rides?limit=10"),
      apiClient.request<{ data: Notification[]; meta: { unread: number } }>("/notifications?limit=5"),
      apiClient.request<{ data: FavouritePlace[] }>("/favourite-places"),
      apiClient.request<{ data: { referralCode: string; referralRewards: ReferralReward[] } }>("/referrals/me"),
      apiClient.request<{ data: RidePass[] }>("/ride-passes/me"),
      apiClient.request<{ data: Delivery[] }>("/deliveries"),
      apiClient.request<{ data: Wallet }>("/wallet"),
      apiClient.request<{ data: ActivePromotion[] }>("/promos/active")
    ]);
    setRides(history.data);
    const currentRide = history.data.find((ride) => !["COMPLETED", "CANCELLED"].includes(ride.status)) ?? null;
    setActiveRide(currentRide);
    setTrackedRideId((current) => current ?? currentRide?.id ?? null);
    setNotifications(inbox.data);
    setUnread(inbox.meta.unread);
    setFavourites(places.data);
    setReferralCode(referrals.data.referralCode);
    setReferralRewards(referrals.data.referralRewards);
    setWallet(passengerWallet.data);
    setActivePromotions(promotions.data);
    setRidePasses(passes.data);
    setDeliveries(deliveryHistory.data);
  }

  async function copyReferralCode() {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2_000);
    } catch {
      setMessage(`Referral code: ${referralCode}`);
    }
  }

  useEffect(() => {
    loadDashboard().catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!activeRide) return;
    const timer = window.setInterval(() => {
      apiClient.request<{ data: Ride }>(`/rides/${activeRide.id}`)
        .then((response) => {
          setActiveRide(response.data);
          setRides((current) => current.map((ride) => ride.id === response.data.id ? response.data : ride));
        })
        .catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [activeRide?.id]);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  async function changeLocale(nextLocale: SupportedLocale) {
    setLocale(nextLocale);
    if (apiClient.hasSession()) await apiClient.request("/users/me/preferences", { method: "PATCH", body: JSON.stringify({ locale: nextLocale }) });
  }

  useEffect(() => {
    if (!trackedRideId || !apiClient.hasSession()) { setTrackingStatus("idle"); return; }
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | undefined;
    let currentSocket: WebSocket | null = null;
    const applyLocation = (location: { latitude: number; longitude: number } | null, eta: number | null | undefined) => {
      if (location) setLiveLocation({ latitude: location.latitude, longitude: location.longitude });
      setEtaSeconds(eta ?? null);
    };
    const pollTracking = () => apiClient.request<{ data: TrackingResponse }>(`/rides/${trackedRideId}/tracking`)
      .then((response) => { if (!disposed) applyLocation(response.data.current, response.data.etaSeconds); })
      .catch(() => undefined);
    const connect = () => {
      if (disposed) return;
      setTrackingStatus(reconnectAttempt ? "reconnecting" : "connecting");
      const socket = apiClient.connect();
      currentSocket = socket;
      trackingSocket.current = socket;
      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setTrackingStatus("live");
        socket.send(JSON.stringify({ type: "ride.subscribe", rideId: trackedRideId }));
      });
      socket.addEventListener("message", (event) => {
        const update = JSON.parse(event.data) as { type: string; latitude?: number; longitude?: number; etaSeconds?: number; id?: string; senderId?: string; content?: string; createdAt?: string };
        if (update.type === "driver.location" && update.latitude != null && update.longitude != null) applyLocation({ latitude: update.latitude, longitude: update.longitude }, update.etaSeconds);
        if (update.type === "chat.message" && update.id && update.senderId && update.content && update.createdAt) {
          setChatMessages((current) => current.some((message) => message.id === update.id) ? current : [...current, { id: update.id!, senderId: update.senderId!, content: update.content!, createdAt: update.createdAt! }]);
        }
      });
      socket.addEventListener("close", () => {
        if (disposed) return;
        trackingSocket.current = null;
        setTrackingStatus("reconnecting");
        const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt++);
        reconnectTimer = window.setTimeout(connect, delay);
      });
      socket.addEventListener("error", () => socket.close());
    };
    setLiveLocation(null);
    void pollTracking();
    const fallbackTimer = window.setInterval(pollTracking, 15_000);
    apiClient.request<{ data: ChatMessage[] }>(`/rides/${trackedRideId}/chat`).then((response) => setChatMessages(response.data)).catch(() => setChatMessages([]));
    connect();
    return () => {
      disposed = true;
      window.clearInterval(fallbackTimer);
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      trackingSocket.current = null;
      currentSocket?.close();
    };
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
    const validLocation = (location: Location) => location.address.trim().length > 0
      && Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
      && Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    if (!validLocation(pickup) || !validLocation(destination)
      || (pickup.latitude === destination.latitude && pickup.longitude === destination.longitude)) {
      setQuote(null);
      setMessage("Enter a valid pickup and destination at two different locations.");
      return;
    }
    try {
      setQuote(null);
      const response = await apiClient.request<{ data: Quote }>("/rides/quote", {
        method: "POST",
        body: JSON.stringify({ ...locations, rideType: rideOption, promoCode: promo || undefined })
      });
      setQuote(response.data);
      setMessage("");
    } catch (error) {
      setQuote(null);
      if (error instanceof ApiRequestError) {
        if (error.code === "INVALID_LOCATION") setMessage("Enter a valid pickup and destination at two different locations.");
        else if (error.code === "ROUTE_UNAVAILABLE") setMessage("No driving route is available between these locations. Choose another pickup or destination.");
        else if (["NETWORK_FAILURE", "ROUTING_NETWORK_FAILURE"].includes(error.code)) setMessage("Network failure. Check your connection and try the estimate again.");
        else setMessage(error.message);
      } else setMessage("Network failure. Check your connection and try the estimate again.");
    }
  }

  async function book() {
    try {
      setBooking(true);
      const response = await apiClient.request<{ data: { id: string } }>("/rides", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ ...locations, rideType: rideOption, paymentMethod, promoCode: promo || undefined, scheduledFor: scheduledFor || undefined })
      });
      setMessage(`Ride ${response.data.id.slice(0, 8)} requested. Searching for a nearby driver.`);
      setTrackedRideId(response.data.id);
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setBooking(false); }
  }

  async function requestDelivery() {
    try {
      const response = await apiClient.request<{ data: Delivery }>("/deliveries", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ pickup: locations.pickup, dropoff: locations.destination, recipientName: "Delivery recipient", recipientPhone: "0770000000", packageDescription: "Sealed small parcel" })
      });
      setMessage(`Delivery ${response.data.id.slice(0, 8)} requested.`);
      await loadDashboard();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function saveFavourite(type: FavouritePlace["type"], label: string, place: Location) {
    try {
      await apiClient.request("/favourite-places", { method: "POST", body: JSON.stringify({ type, label, ...place }) });
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setBooking(false); }
  }

  function selectFavourite(place: FavouritePlace, target: "pickup" | "destination") {
    const location = { address: place.address, latitude: place.latitude, longitude: place.longitude };
    if (target === "pickup") setPickup(location);
    else setDestination(location);
    setQuote(null);
    setMessage("");
  }

  function useCurrentPickup() {
    if (!navigator.geolocation) {
      setMessage("Location services are unavailable on this device. Enter your pickup manually.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickup({ address: "Current location", latitude: position.coords.latitude, longitude: position.coords.longitude });
        setQuote(null);
        setLocating(false);
        setMessage("Pickup set from your device location.");
      },
      (error) => {
        setLocating(false);
        setMessage(error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser settings, or enter your pickup manually."
          : "Your current location could not be found. Check GPS and network access, then try again.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  }

  async function loadReceipt(rideId: string) {
    try {
      const response = await apiClient.request<{ data: Receipt }>(`/rides/${rideId}/receipt`);
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

  async function transitionRide(rideId: string, status: "PASSENGER_BOARDED") {
    try {
      await apiClient.request(`/rides/${rideId}/transitions`, { method: "POST", body: JSON.stringify({ status }) });
      await loadDashboard();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function confirmCancellation() {
    if (!cancelRideId || cancelReason.trim().length < 3) return;
    setCancelling(true);
    try {
      await apiClient.request(`/rides/${cancelRideId}/transitions`, { method: "POST", body: JSON.stringify({ status: "CANCELLED", cancellationReason: cancelReason.trim() }) });
      setMessage("Your ride was cancelled. The driver has been notified.");
      setCancelRideId(null);
      setTrackedRideId(null);
      await loadDashboard();
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setCancelling(false); }
  }

  async function sendSos() {
    if (!sosRideId) return;
    setSosSending(true);
    try {
      const passengerLocation = await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8_000, maximumAge: 10_000 }
        );
      });
      await apiClient.request(`/rides/${sosRideId}/sos`, { method: "POST", body: JSON.stringify({ category: sosCategory, ...(sosNote.trim() ? { note: sosNote.trim() } : {}), ...(passengerLocation ?? {}) }) });
      setMessage(passengerLocation ? "SOS sent with your current location. The LibSwiftRide safety team has been alerted." : "SOS sent without location. The LibSwiftRide safety team has been alerted.");
      setSosRideId(null);
      setSosNote("");
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setSosSending(false); }
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

  const featuredPromotion = activePromotions[0];

  return (
    <Shell product="Passenger" demoRole="PASSENGER">
      <div className="toolbar">
        <div><span className="eyebrow">{passengerMessage(locale, "passengerHome")}</span><h1>{passengerMessage(locale, "whereTo")}</h1></div>
        <label>Language<select aria-label="Language" value={locale} onChange={(event) => changeLocale(event.target.value as SupportedLocale)}>{supportedLocales.map((value) => <option key={value} value={value}>{value === "en" ? "English" : "Français"}</option>)}</select></label>
      </div>
      {message && <p className={message.startsWith("Ride") ? "notice" : "notice error"}>{message}</p>}
      {featuredPromotion && <section className="promo-banner" aria-label={passengerMessage(locale, "limitedOffer")}>
        <div><span className="promo-kicker">{passengerMessage(locale, "limitedOffer")}</span><strong>{featuredPromotion.percentageOff ? `${featuredPromotion.percentageOff}% ${passengerMessage(locale, "offRide")}` : `${money(featuredPromotion.amountOffMinor ?? 0)} ${passengerMessage(locale, "offRide")}`}</strong><small>{featuredPromotion.description} · {passengerMessage(locale, "expires")} {new Date(featuredPromotion.expiresAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-LR")}</small></div>
        <button type="button" onClick={() => { setPromo(featuredPromotion.code); setQuote(null); }}>{promo === featuredPromotion.code ? passengerMessage(locale, "applied") : `${passengerMessage(locale, "apply")} ${featuredPromotion.code}`}</button>
      </section>}
      <section className="hero passenger-booking">
        <div className="panel form">
          <label>{translatedMessage(locale, "pickup")}<input value={pickup.address} onChange={(event) => { setPickup({ ...pickup, address: event.target.value }); setQuote(null); }} /></label>
          <button className="link-button" type="button" disabled={locating} onClick={useCurrentPickup}>{passengerMessage(locale, locating ? "findingLocation" : "useGps")}</button>
          <label>{translatedMessage(locale, "destination")}<input value={destination.address} onChange={(event) => { setDestination({ ...destination, address: event.target.value }); setQuote(null); }} /></label>
          {favourites.length > 0 && <div className="saved-place-shortcuts" aria-label={passengerMessage(locale, "savedPlaces")}>
            {favourites.slice(0, 4).map((place) => <button key={place.id} type="button" onClick={() => selectFavourite(place, "destination")}>
              <span aria-hidden="true">{place.type === "HOME" ? "⌂" : place.type === "WORK" ? "▣" : "★"}</span>
              <span><strong>{place.label}</strong><small>{place.address}</small></span>
            </button>)}
          </div>}
          <fieldset className="ride-options">
            <legend>{passengerMessage(locale, "chooseRide")}</legend>
            {([
              ["ECONOMY", "🚗", "Economy", "Affordable everyday rides", true],
              ["PREMIUM", "🚙", "Premium", "More comfort and newer vehicles", false],
              ["BUSINESS", "🏢", "Business Ride", "Approved company travel", false]
            ] as const).map(([value, icon, title, detail, available]) => <button key={value} type="button" className={rideOption === value ? "ride-option selected" : "ride-option"} disabled={!available} onClick={() => { setRideOption(value); setQuote(null); }}>
              <span>{icon}</span><span><strong>{value === "ECONOMY" ? passengerMessage(locale, "economy") : title}</strong><small>{value === "ECONOMY" ? passengerMessage(locale, "economyDetail") : detail}</small></span><b>{available ? rideOption === value ? passengerMessage(locale, "selected") : "Choose" : "Coming soon"}</b>
            </button>)}
          </fieldset>
          <label>{passengerMessage(locale, "promoCode")}<input value={promo} onChange={(event) => setPromo(event.target.value)} placeholder={passengerMessage(locale, "optional")} /></label>
          <label>{passengerMessage(locale, "scheduleLater")}<input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
          <div className="toolbar">
            <button className="link-button" onClick={() => saveFavourite("HOME", "Home", locations.pickup)}>{passengerMessage(locale, "saveHome")}</button>
            <button className="link-button" onClick={() => saveFavourite("WORK", "Work", locations.destination)}>{passengerMessage(locale, "saveWork")}</button>
          </div>
          <label>
            {translatedMessage(locale, "payment")}
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
              <option value="CASH">{passengerMessage(locale, "cash")}</option>
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
          {trackedRideId && <p className="notice" role="status">Live tracking: {trackingStatus === "live" ? "connected" : trackingStatus === "reconnecting" ? "reconnecting" : "connecting"}{etaSeconds ? ` · driver ETA ${Math.ceil(etaSeconds / 60)} min` : ""}</p>}
          <div className="toolbar">
            <button className="action" disabled={!pickup.address.trim() || !destination.address.trim()} onClick={getQuote}>{translatedMessage(locale, "getEstimate")}</button>
            {quote && <button className="action" disabled={booking || Boolean(activeRide)} onClick={book}>{passengerMessage(locale, booking ? "requesting" : activeRide ? "activeRideExists" : "confirmRide")}</button>}
          </div>
          {quote && (
            <div className="estimate-card" aria-live="polite">
              <div><span className="eyebrow">{passengerMessage(locale, "estimatedTrip")}</span><h2>{money(quote.fareMinor)}</h2></div>
              <div className="estimate-details">
                <Stat label={passengerMessage(locale, "fare")} value={money(quote.fareMinor)} />
                <Stat label={passengerMessage(locale, "distance")} value={`${(quote.estimatedDistanceM / 1_000).toFixed(1)} km`} />
                <Stat label={passengerMessage(locale, "tripDuration")} value={`${Math.max(1, Math.round(quote.estimatedDurationSec / 60))} min`} />
                <Stat label={passengerMessage(locale, "rideType")} value={quote.rideType === "ECONOMY" ? passengerMessage(locale, "economy") : quote.rideType} detail={quote.discountMinor ? `Discount ${money(quote.discountMinor)}` : "Server-calculated estimate"} />
              </div>
            </div>
          )}
        </div>
        <Map
          pickup={{ ...pickup, label: "Pickup" }}
          destination={{ ...destination, label: "Destination" }}
          route={quote?.route.geometry ?? []}
          drivers={liveLocation ? [{ ...liveLocation, label: "Your driver" }] : []}
          label={liveLocation ? `Live driver location${etaSeconds ? ` · ETA ${Math.ceil(etaSeconds / 60)} min` : ""}` : "Pickup and destination"}
        />
      </section>
      {activeRide && <section className="panel trip-progress" aria-live="polite">
        <span className="eyebrow">{passengerMessage(locale, "currentRide")}</span>
        <h2>{rideStatusLabel(activeRide.status, locale)}</h2>
        <div className="trip-steps" aria-label="Ride progress">
          {["SEARCHING", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"].map((status, index) => {
            const order = ["REQUESTED", "SEARCHING", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS", "COMPLETED"];
            return <span key={status} className={order.indexOf(activeRide.status) >= order.indexOf(status) ? "complete" : ""}>{index + 1}<small>{rideStatusLabel(status, locale)}</small></span>;
          })}
        </div>
        {activeRide.driver ? <div className="driver-details">
          <div><strong>{activeRide.driver.user.firstName} {activeRide.driver.user.lastName}</strong><p>{activeRide.driver.rating.count ? `â˜… ${activeRide.driver.rating.average?.toFixed(1)} from ${activeRide.driver.rating.count} ratings` : "New driver Â· no ratings yet"}</p></div>
          <div><strong>{activeRide.driver.vehicle ? `${activeRide.driver.vehicle.color} ${activeRide.driver.vehicle.make} ${activeRide.driver.vehicle.model}` : "Vehicle details pending"}</strong><p>{activeRide.driver.vehicle?.plateNumber ?? "Plate pending"}</p></div>
        </div> : <p>{passengerMessage(locale, "matchingDriver")}</p>}
        {activeRide.status === "DRIVER_ARRIVED" && <button className="action" onClick={() => transitionRide(activeRide.id, "PASSENGER_BOARDED")}>{passengerMessage(locale, "confirmVehicle")}</button>}
        <button className="action danger" type="button" onClick={() => { setSosRideId(activeRide.id); setSosCategory("SECURITY"); setSosNote(""); }}>{passengerMessage(locale, "sosEmergency")}</button>
        <button className="action danger" type="button" onClick={() => { setCancelRideId(activeRide.id); setCancelReason("Plans changed"); }}>{passengerMessage(locale, "cancelRide")}</button>
        <p className="notice">{passengerMessage(locale, activeRide.payment?.status === "CAPTURED" ? "paymentConfirmed" : activeRide.paymentMethod === "CASH" ? "cashPaymentHint" : "electronicPaymentHint")}</p>
      </section>}
      {sosRideId && <section className="panel" aria-labelledby="sos-title">
        <span className="eyebrow">{passengerMessage(locale, "emergencyAssistance")}</span>
        <h2 id="sos-title">{passengerMessage(locale, "sendSosAlert")}</h2>
        <p>{passengerMessage(locale, "emergencyExplanation")}</p>
        <label>{passengerMessage(locale, "emergencyType")}
          <select value={sosCategory} onChange={(event) => setSosCategory(event.target.value as SosCategory)}>
            <option value="SECURITY">{passengerMessage(locale, "securityThreat")}</option>
            <option value="MEDICAL">{passengerMessage(locale, "medicalEmergency")}</option>
            <option value="CRASH">{passengerMessage(locale, "crashCollision")}</option>
            <option value="HARASSMENT">{passengerMessage(locale, "harassment")}</option>
            <option value="OTHER">{passengerMessage(locale, "otherEmergency")}</option>
          </select>
        </label>
        <label>{passengerMessage(locale, "details")} <span className="optional-label">{passengerMessage(locale, "optional")}</span>
          <textarea value={sosNote} maxLength={500} onChange={(event) => setSosNote(event.target.value)} placeholder={passengerMessage(locale, "responderInfo")} />
        </label>
        <p className="privacy-hint">{passengerMessage(locale, "emergencyGpsHint")}</p>
        <div className="toolbar">
          <button className="action danger" type="button" disabled={sosSending} onClick={sendSos}>{passengerMessage(locale, sosSending ? "sendingSos" : "sendSosNow")}</button>
          <button className="action secondary" type="button" disabled={sosSending} onClick={() => setSosRideId(null)}>{passengerMessage(locale, "goBack")}</button>
        </div>
      </section>}
      {cancelRideId && <section className="panel" aria-labelledby="cancel-ride-title">
        <span className="eyebrow">{passengerMessage(locale, "cancellation")}</span>
        <h2 id="cancel-ride-title">{passengerMessage(locale, "cancelQuestion")}</h2>
        <p>{passengerMessage(locale, "cancelExplanation")}</p>
        <label>{passengerMessage(locale, "reason")}
          <select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>
            <option value="Plans changed">{passengerMessage(locale, "plansChanged")}</option>
            <option value="Driver is taking too long">{passengerMessage(locale, "driverTooLong")}</option>
            <option value="Pickup location is incorrect">{passengerMessage(locale, "pickupIncorrect")}</option>
            <option value="Booked by mistake">{passengerMessage(locale, "bookedMistake")}</option>
            <option value="Safety concern">{passengerMessage(locale, "safetyConcern")}</option>
            <option value="Other">{passengerMessage(locale, "other")}</option>
          </select>
        </label>
        <div className="toolbar">
          <button className="action danger" type="button" disabled={cancelling} onClick={confirmCancellation}>{passengerMessage(locale, cancelling ? "cancelling" : "confirmCancellation")}</button>
          <button className="action secondary" type="button" disabled={cancelling} onClick={() => setCancelRideId(null)}>{passengerMessage(locale, "keepRide")}</button>
        </div>
      </section>}
      <section id="history" className="panel">
        <div className="toolbar"><h2>{passengerMessage(locale, "recentRides")}</h2><span>{unread} {passengerMessage(locale, "unreadNotifications")}</span></div>
        <table><thead><tr><th>{passengerMessage(locale, "route")}</th><th>{passengerMessage(locale, "status")}</th><th>{passengerMessage(locale, "fare")}</th><th>{passengerMessage(locale, "rating")}</th><th>{passengerMessage(locale, "receipt")}</th></tr></thead>
          <tbody>{rides.map((ride) => (
            <tr key={ride.id}>
              <td>{ride.pickupAddress} → {ride.destinationAddress}</td>
              <td><button className="link-button" onClick={() => setTrackedRideId(ride.id)}>{rideStatusLabel(ride.status, locale)}</button>
                {ride.status === "DRIVER_ARRIVED" && <button className="link-button" onClick={() => transitionRide(ride.id, "PASSENGER_BOARDED")}>{passengerMessage(locale, "boarded")}</button>}
                {!["COMPLETED", "CANCELLED"].includes(ride.status) && <><button className="link-button" onClick={() => shareTrip(ride.id)}>{passengerMessage(locale, "share")}</button><button onClick={() => { setSosRideId(ride.id); setSosCategory("SECURITY"); setSosNote(""); }}>SOS</button><button className="link-button" onClick={() => { setCancelRideId(ride.id); setCancelReason("Plans changed"); }}>{passengerMessage(locale, "cancel")}</button></>}
              </td>
              <td>{money(ride.fareMinor)}</td>
              <td>{ride.status === "COMPLETED" && !(ride.ratings?.length ?? 0)
                ? <span className="rating-actions">{[1, 2, 3, 4, 5].map((score) => <button key={score} onClick={() => rateRide(ride.id, score)} aria-label={`Rate ${score} stars`}>★</button>)}</span>
                : ride.ratings?.[0]?.score ?? "—"}</td>
              <td>{ride.status === "COMPLETED" && <><button className="link-button" onClick={() => loadReceipt(ride.id)}>{passengerMessage(locale, "view")}</button> · <button className="link-button" onClick={() => downloadReceipt(ride.id)}>PDF</button></>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rides.length && <p>{passengerMessage(locale, "signInHistory")}</p>}
      </section>
      {receipt && <section className="panel receipt-card" aria-labelledby="receipt-title">
        <div className="toolbar"><div><span className="eyebrow">{passengerMessage(locale, "receipt")}</span><h2 id="receipt-title">{receipt.receiptNumber}</h2></div><button className="action secondary" type="button" onClick={() => downloadReceipt(receipt.rideId)}>{passengerMessage(locale, "downloadPdf")}</button></div>
        <p>{receipt.completedAt ? new Date(receipt.completedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-LR", { timeZone: "Africa/Monrovia" }) : passengerMessage(locale, "completionPending")}</p>
        <div className="receipt-route"><strong>{receipt.route.pickup}</strong><span>{passengerMessage(locale, "to")}</span><strong>{receipt.route.destination}</strong></div>
        <div className="receipt-details">
          <div><span>{passengerMessage(locale, "baseFare")}</span><strong>{money(receipt.fare.baseFareMinor, receipt.fare.currency)}</strong></div>
          {receipt.fare.dynamicMultiplierBps !== 10_000 && <div><span>{passengerMessage(locale, "demandAdjustment")}</span><strong>{(receipt.fare.dynamicMultiplierBps / 10_000).toFixed(2)}x</strong></div>}
          {receipt.fare.waitingFeeMinor > 0 && <div><span>{passengerMessage(locale, "waitingFee")} ({Math.ceil(receipt.fare.waitingTimeSec / 60)} min)</span><strong>{money(receipt.fare.waitingFeeMinor, receipt.fare.currency)}</strong></div>}
          {receipt.fare.tollMinor > 0 && <div><span>{passengerMessage(locale, "tolls")}</span><strong>{money(receipt.fare.tollMinor, receipt.fare.currency)}</strong></div>}
          <div><span>{passengerMessage(locale, "subtotal")}</span><strong>{money(receipt.fare.subtotalMinor, receipt.fare.currency)}</strong></div>
          {receipt.fare.discountMinor > 0 && <div><span>{passengerMessage(locale, "discount")}{receipt.promoCode ? ` (${receipt.promoCode})` : ""}</span><strong>-{money(receipt.fare.discountMinor, receipt.fare.currency)}</strong></div>}
          <div className="receipt-total"><span>{passengerMessage(locale, "totalPaid")}</span><strong>{money(receipt.fare.totalMinor, receipt.fare.currency)}</strong></div>
          {receipt.fare.refundedMinor > 0 && <div><span>{passengerMessage(locale, "refunded")}</span><strong>{money(receipt.fare.refundedMinor, receipt.fare.currency)}</strong></div>}
        </div>
        <div className="receipt-meta">
          <p><strong>{passengerMessage(locale, "paymentLabel")}</strong><br />{receipt.payment.method.replaceAll("_", " ")} · {receipt.payment.status.replaceAll("_", " ")}</p>
          <p><strong>{passengerMessage(locale, "driver")}</strong><br />{receipt.driver?.name ?? passengerMessage(locale, "notAssigned")}{receipt.driver?.vehicle ? ` · ${receipt.driver.vehicle.make} ${receipt.driver.vehicle.model} · ${receipt.driver.vehicle.plateNumber}` : ""}</p>
          <p><strong>{passengerMessage(locale, "fareAllocation")}</strong><br />{passengerMessage(locale, "allocationDriver")} {money(receipt.fare.driverEarningsMinor, receipt.fare.currency)} · {passengerMessage(locale, "allocationPlatform")} {money(receipt.fare.companyCommissionMinor, receipt.fare.currency)}</p>
        </div>
        <button className="link-button" type="button" onClick={() => setReceipt(null)}>{passengerMessage(locale, "closeReceipt")}</button>
      </section>}
      {trackedRideId && <section className="panel" aria-live="polite">
        <h2>{passengerMessage(locale, "rideChat")}</h2>
        <div>{chatMessages.map((chat) => <p key={chat.id}>{chat.content}<br /><small>{new Date(chat.createdAt).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-LR")}</small></p>)}</div>
        <div className="form-row"><label>{passengerMessage(locale, "chatMessage")}<input value={chatInput} maxLength={500} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendChat(); }} /></label><button className="action" onClick={sendChat}>{passengerMessage(locale, "send")}</button></div>
      </section>}
      <section className="panel referral-wallet">
        <div className="toolbar">
          <div><span className="eyebrow">{passengerMessage(locale, "referralWallet")}</span><h2>{passengerMessage(locale, "inviteEarn")}</h2></div>
          <div className="referral-balance"><small>{passengerMessage(locale, "availableBalance")}</small><strong>{wallet ? money(wallet.balanceMinor, wallet.currency) : "—"}</strong></div>
        </div>
        <p>{passengerMessage(locale, "referralExplanation")}</p>
        <div className="referral-code">
          <span><small>{passengerMessage(locale, "yourReferralCode")}</small><strong>{referralCode || passengerMessage(locale, "signInCode")}</strong></span>
          <button className="action secondary" type="button" disabled={!referralCode} onClick={copyReferralCode}>{passengerMessage(locale, codeCopied ? "copied" : "copyCode")}</button>
        </div>
        <div className="referral-summary">
          <div><strong>{referralRewards.length}</strong><small>{passengerMessage(locale, "totalReferrals")}</small></div>
          <div><strong>{referralRewards.filter((reward) => reward.status === "REWARDED").length}</strong><small>{passengerMessage(locale, "rewardsEarned")}</small></div>
          <div><strong>{money(referralRewards.filter((reward) => reward.status === "REWARDED").reduce((total, reward) => total + reward.rewardMinor, 0), wallet?.currency ?? "LRD")}</strong><small>{passengerMessage(locale, "totalRewards")}</small></div>
        </div>
        {referralRewards.length > 0 && <div className="referral-activity">
          <h3>{passengerMessage(locale, "rewardActivity")}</h3>
          {referralRewards.slice(0, 5).map((reward) => <div key={reward.id}><span><strong>{passengerMessage(locale, "friendReferral")}</strong><small>{new Date(reward.createdAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-LR")}</small></span><span className={`badge ${reward.status === "REWARDED" ? "green" : "amber"}`}>{reward.status === "REWARDED" ? passengerMessage(locale, "rewardsEarned") : passengerMessage(locale, "pending")}</span><strong>{reward.status === "REWARDED" ? `+${money(reward.rewardMinor, wallet?.currency ?? "LRD")}` : passengerMessage(locale, "pending")}</strong></div>)}
        </div>}
      </section>
      <section className="panel">
        <div className="toolbar"><div><span className="eyebrow">{passengerMessage(locale, "deliveryService")}</span><h2>{passengerMessage(locale, "sendParcel")}</h2></div><button className="action" onClick={requestDelivery}>{passengerMessage(locale, "requestSampleRoute")}</button></div>
        <p>{passengerMessage(locale, "deliveryExplanation")}</p>
        <table><thead><tr><th>{passengerMessage(locale, "route")}</th><th>{passengerMessage(locale, "status")}</th><th>{passengerMessage(locale, "fare")}</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td>{delivery.pickupAddress} → {delivery.dropoffAddress}</td><td>{delivery.status}</td><td>{money(delivery.fareMinor)}</td></tr>)}</tbody></table>
      </section>
      <section className="panel">
        <span className="eyebrow">{passengerMessage(locale, "monthlyPasses")}</span><h2>{passengerMessage(locale, "rideCredits")}</h2>
        {ridePasses.map((pass) => <p key={pass.id}><strong>{pass.product.name}</strong> · {pass.ridesRemaining} {passengerMessage(locale, "ridesRemaining")} · {passengerMessage(locale, "expires")} {new Date(pass.expiresAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-LR")} · {pass.status}</p>)}
        {!ridePasses.length && <p>{passengerMessage(locale, "noActivePass")}</p>}
      </section>
      <section className="panel">
        <h2>{passengerMessage(locale, "savedPlaces")}</h2>
        <div className="saved-place-list">
          {favourites.map((place) => <article key={place.id} className="saved-place-card">
            <span className="saved-place-icon" aria-hidden="true">{place.type === "HOME" ? "⌂" : place.type === "WORK" ? "▣" : "★"}</span>
            <div><strong>{place.label}</strong><small>{place.address}</small></div>
            <div className="saved-place-actions">
              <button type="button" onClick={() => selectFavourite(place, "pickup")}>{passengerMessage(locale, "useAsPickup")}</button>
              <button type="button" onClick={() => selectFavourite(place, "destination")}>{passengerMessage(locale, "useAsDestination")}</button>
            </div>
          </article>)}
        </div>
        {!favourites.length && <p>{passengerMessage(locale, "noSavedPlaces")}</p>}
      </section>
      <section className="panel">
        <h2>{passengerMessage(locale, "notifications")}</h2>
        {notifications.map((notification) => <p key={notification.id}><strong>{notification.title}</strong><br />{notification.body}</p>)}
        {!notifications.length && <p>{passengerMessage(locale, "noNotifications")}</p>}
      </section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
