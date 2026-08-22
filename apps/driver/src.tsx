import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Action, Map, Shell, Stat, useNetworkStatus } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";
import { startLocationTracking, type LocationFailure } from "./location-runtime.js";

type ActiveRide = {
  id: string; status: string; pickupAddress: string; pickupLatitude: number; pickupLongitude: number;
  destinationAddress: string; destinationLatitude: number; destinationLongitude: number;
  fareMinor: number; driverEarningsMinor: number; estimatedDistanceM: number; estimatedDurationSec: number; paymentMethod: string;
  passenger: { firstName: string; lastName: string; phone: string };
};
type Dashboard = {
  driver: { firstName: string; lastName: string; status: string; verifiedAt: string | null; kycStatus: string | null; vehicle: { plateNumber: string } | null };
  earnings: { driverEarningsMinor: number; completedRides: number; currency: string; today: { driverEarningsMinor: number; completedRides: number }; lastSevenDays: { driverEarningsMinor: number; completedRides: number } };
  wallet: { balanceMinor: number; currency: string };
  performance: { completedRides: number; cancelledRides: number; completionRate: number };
  rating: { average: number | null; count: number };
  activeRide: ActiveRide | null;
  unreadNotifications: number;
};
type AvailabilityWindow = { id: string; startsAt: string; endsAt: string };
type RideHistory = { id: string; status: string; pickupAddress: string; destinationAddress: string; driverEarningsMinor: number; completedAt: string | null };
type ChatMessage = { id: string; senderId: string; content: string; createdAt: string };
type Incentive = { id: string; name: string; minimumRides: number; bonusMinor: number; completedRides: number; awarded: boolean; endsAt: string };
type KycDocumentType = "DRIVER_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE" | "INSPECTION" | "PROFILE_PHOTO";
type Onboarding = { id: string; onboardingStep: string; verifiedAt: string | null; status: string; kycCase: { status: string; rejectionCode: string | null; rejectionNotes: string | null; documents: Array<{ type: string; sizeBytes: number; scanStatus: string }> } | null; vehicle: { make: string; model: string; plateNumber: string; active: boolean } | null };
type KycUploadConfig = { enabled: boolean; fictionalOnly: boolean; maxBytes: number; mimeTypes: string[] };

const nextStatus: Record<string, string> = {
  DRIVER_ASSIGNED: "DRIVER_ARRIVING",
  DRIVER_ARRIVING: "DRIVER_ARRIVED",
  PASSENGER_BOARDED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED"
};

function App() {
  const networkOnline = useNetworkStatus();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("Sign in to load your driver profile.");
  const [coords, setCoords] = useState({ latitude: 6.3156, longitude: -10.8074 });
  const [gpsStatus, setGpsStatus] = useState<"off" | "requesting" | "live" | "blocked" | "unavailable">("off");
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [lastLocationAt, setLastLocationAt] = useState<Date | null>(null);
  const [schedule, setSchedule] = useState<AvailabilityWindow[]>([]);
  const [history, setHistory] = useState<RideHistory[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [onboarding, setOnboarding] = useState<Onboarding | null | undefined>(undefined);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [nationalIdRef, setNationalIdRef] = useState("");
  const [offerSeconds, setOfferSeconds] = useState(60);
  const [kycUploadConfig, setKycUploadConfig] = useState<KycUploadConfig | null>(null);
  const [fictionalConfirmed, setFictionalConfirmed] = useState(false);
  const [uploadingType, setUploadingType] = useState<KycDocumentType | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const stopLocationTracking = useRef<(() => Promise<void>) | null>(null);
  const lastLocationSentAt = useRef(0);

  async function uploadKycDocument(type: KycDocumentType, file: File | undefined) {
    if (!file || !kycUploadConfig) return;
    if (kycUploadConfig.fictionalOnly && !fictionalConfirmed) return setMessage("Confirm that this is a fictional staging document before uploading.");
    if (!kycUploadConfig.mimeTypes.includes(file.type)) return setMessage("Choose a JPEG, PNG, or PDF file.");
    if (file.size > kycUploadConfig.maxBytes) return setMessage(`File must be ${Math.floor(kycUploadConfig.maxBytes / 1024 / 1024)} MB or smaller.`);
    setUploadingType(type); setMessage(`Securely uploading ${file.name}…`);
    try {
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const intent = await apiClient.request<{ data: { storageKey: string; uploadUrl: string; requiredHeaders: Record<string, string> } }>("/drivers/kyc/uploads", { method: "POST", body: JSON.stringify({ type, mimeType: file.type, sizeBytes: file.size, fictionalDocument: kycUploadConfig.fictionalOnly }) });
      const uploaded = await fetch(intent.data.uploadUrl, { method: "PUT", headers: intent.data.requiredHeaders, body: file });
      if (!uploaded.ok) throw new Error("Private storage rejected the upload. Check bucket CORS and try again.");
      await apiClient.request("/drivers/kyc/uploads/complete", { method: "POST", body: JSON.stringify({ type, storageKey: intent.data.storageKey, mimeType: file.type, sizeBytes: file.size, checksum }) });
      setMessage(`${file.name} uploaded and passed security scanning.`);
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setUploadingType(null); }
  }

  async function submitKyc() {
    try { await apiClient.request("/drivers/kyc/submit", { method: "POST", body: "{}" }); await load(); setMessage("Verification submitted for Admin review."); }
    catch (error) { setMessage((error as Error).message); }
  }

  async function load() {
    if (!apiClient.hasSession()) return;
    const [onboardingResponse, uploadConfigResponse] = await Promise.all([
      apiClient.request<{ data: Onboarding | null }>("/drivers/me/onboarding"),
      apiClient.request<{ data: KycUploadConfig }>("/drivers/kyc/uploads/config")
    ]);
    setKycUploadConfig(uploadConfigResponse.data);
    setOnboarding(onboardingResponse.data);
    if (!onboardingResponse.data) {
      setDashboard(null);
      setMessage("Complete your driver profile to begin verification.");
      return;
    }
    const [response, windows, rides, incentivePrograms] = await Promise.all([
      apiClient.request<{ data: Dashboard }>("/drivers/me/dashboard"),
      apiClient.request<{ data: AvailabilityWindow[] }>("/drivers/me/availability-schedule"),
      apiClient.request<{ data: RideHistory[] }>("/rides?limit=10"),
      apiClient.request<{ data: Incentive[] }>("/drivers/me/incentives")
    ]);
    setDashboard(response.data); setSchedule(windows.data); setHistory(rides.data);
    setIncentives(incentivePrograms.data);
    if (response.data.activeRide) {
      apiClient.request<{ data: ChatMessage[] }>(`/rides/${response.data.activeRide.id}/chat`).then((chat) => setChatMessages(chat.data)).catch(() => setChatMessages([]));
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "ride.subscribe", rideId: response.data.activeRide.id }));
    }
    setMessage("");
  }

  async function startOnboarding() {
    try {
      await apiClient.request("/drivers/onboarding", { method: "POST", body: JSON.stringify({ licenseNumber, nationalIdRef }) });
      setLicenseNumber("");
      setNationalIdRef("");
      await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function addAvailability() {
    try {
      await apiClient.request("/drivers/me/availability-schedule", { method: "POST", body: JSON.stringify({ startsAt, endsAt }) });
      setStartsAt(""); setEndsAt(""); await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  useEffect(() => {
    load().catch((error: Error) => setMessage(error.message));
    return () => {
      socket.current?.close();
      void stopLocationTracking.current?.();
    };
  }, []);

  useEffect(() => {
    if (dashboard?.activeRide?.status !== "DRIVER_ASSIGNED") {
      setOfferSeconds(60);
      return;
    }
    const timer = window.setInterval(() => setOfferSeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [dashboard?.activeRide?.id, dashboard?.activeRide?.status]);

  useEffect(() => {
    if (offerSeconds !== 0 || dashboard?.activeRide?.status !== "DRIVER_ASSIGNED") return;
    void respondToOffer("reject");
  }, [offerSeconds]);

  async function setAvailability(status: "AVAILABLE" | "OFFLINE") {
    if (!networkOnline) {
      setMessage("You are offline. Reconnect before changing availability or sharing GPS.");
      return;
    }
    try {
      await apiClient.request("/drivers/me/availability", { method: "POST", body: JSON.stringify({ status }) });
      if (status === "OFFLINE") {
        socket.current?.close();
        socket.current = null;
        await stopLocationTracking.current?.();
        stopLocationTracking.current = null;
        setGpsStatus("off");
        setGpsAccuracyM(null);
        setLastLocationAt(null);
      } else {
        setGpsStatus("requesting");
        const connection = apiClient.connect();
        socket.current = connection;
        connection.onopen = () => {
          if (dashboard?.activeRide) connection.send(JSON.stringify({ type: "ride.subscribe", rideId: dashboard.activeRide.id }));
          const locationError = (failure: LocationFailure) => {
            setGpsStatus(failure === "PERMISSION_DENIED" || failure === "NOT_SECURE" ? "blocked" : "unavailable");
            setMessage(failure === "NOT_SECURE" ? "Live GPS requires a secure HTTPS connection on real devices." : failure === "PERMISSION_DENIED" ? "Location permission is blocked. Enable precise location access before going online." : "Live GPS is unavailable. Check device location and network access, then try again.");
            connection.close();
            socket.current = null;
            void stopLocationTracking.current?.();
            stopLocationTracking.current = null;
            void apiClient.request("/drivers/me/availability", { method: "POST", body: JSON.stringify({ status: "OFFLINE" }) }).then(load).catch(() => undefined);
          };
          void startLocationTracking({ onLocation: (sample) => {
            const location = { latitude: sample.latitude, longitude: sample.longitude };
            setCoords(location);
            setGpsStatus("live");
            setGpsAccuracyM(Math.round(sample.accuracyM));
            setLastLocationAt(new Date(sample.capturedAt));
            const now = Date.now();
            if (connection.readyState === WebSocket.OPEN && now - lastLocationSentAt.current >= 2_000) {
              lastLocationSentAt.current = now;
              connection.send(JSON.stringify({ type: "driver.location", ...location, heading: sample.heading, speedMps: sample.speedMps, capturedAt: sample.capturedAt }));
            }
          }, onError: locationError }).then((stop) => { stopLocationTracking.current = stop; });
        };
        connection.onmessage = (event) => {
          const update = JSON.parse(event.data) as { type: string; id?: string; senderId?: string; content?: string; createdAt?: string };
          if (update.type === "chat.message" && update.id && update.senderId && update.content && update.createdAt) {
            setChatMessages((current) => current.some((message) => message.id === update.id) ? current : [...current, { id: update.id!, senderId: update.senderId!, content: update.content!, createdAt: update.createdAt! }]);
          }
        };
      }
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function advanceRide() {
    if (!dashboard?.activeRide) return;
    if (!networkOnline) {
      setMessage("You are offline. Reconnect before changing the ride status.");
      return;
    }
    const status = nextStatus[dashboard.activeRide.status];
    if (!status) return;
    try {
      await apiClient.request(`/rides/${dashboard.activeRide.id}/transitions`, { method: "POST", body: JSON.stringify({ status }) });
      setMessage(`Ride moved to ${status.replaceAll("_", " ").toLowerCase()}.`);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function respondToOffer(decision: "accept" | "reject") {
    if (!dashboard?.activeRide || dashboard.activeRide.status !== "DRIVER_ASSIGNED") return;
    if (!networkOnline) {
      setMessage("You are offline. Reconnect before responding to this ride request.");
      return;
    }
    try {
      await apiClient.request(`/drivers/rides/${dashboard.activeRide.id}/${decision}`, {
        method: "POST",
        ...(decision === "reject" ? { body: JSON.stringify({ reason: "UNAVAILABLE" }) } : {})
      });
      setMessage(decision === "accept" ? "Ride accepted. Navigate safely to the pickup." : "Ride declined. Finding another driver for the passenger.");
      await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function rideAction(status: "CANCELLED") {
    if (!dashboard?.activeRide) return;
    try {
      await apiClient.request(`/rides/${dashboard.activeRide.id}/transitions`, { method: "POST", body: JSON.stringify({ status, cancellationReason: "Cancelled by driver" }) });
      await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function sos() {
    if (!dashboard?.activeRide) return;
    try {
      await apiClient.request(`/rides/${dashboard.activeRide.id}/sos`, { method: "POST", body: JSON.stringify({ category: "SECURITY", ...coords }) });
      setMessage("SOS sent to the LibSwiftRide safety team.");
    } catch (error) { setMessage((error as Error).message); }
  }

  function sendChat() {
    if (!dashboard?.activeRide || !chatInput.trim() || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({ type: "chat.send", rideId: dashboard.activeRide.id, content: chatInput }));
    setChatInput("");
  }

  const online = dashboard?.driver.status === "AVAILABLE";
  const activeNextStatus = dashboard?.activeRide ? nextStatus[dashboard.activeRide.status] : undefined;
  const incomingRide = dashboard?.activeRide?.status === "DRIVER_ASSIGNED" ? dashboard.activeRide : null;
  const navigationTarget = dashboard?.activeRide
    ? ["PASSENGER_BOARDED", "IN_PROGRESS"].includes(dashboard.activeRide.status)
      ? { latitude: dashboard.activeRide.destinationLatitude, longitude: dashboard.activeRide.destinationLongitude }
      : { latitude: dashboard.activeRide.pickupLatitude, longitude: dashboard.activeRide.pickupLongitude }
    : null;
  const navigationUrl = navigationTarget
    ? `https://www.google.com/maps/dir/?api=1&origin=${coords.latitude}%2C${coords.longitude}&destination=${navigationTarget.latitude}%2C${navigationTarget.longitude}&travelmode=driving`
    : "";
  return (
    <Shell product="Driver" demoRole="DRIVER">
      {onboarding === null && <section className="panel onboarding-panel">
        <span className="eyebrow">Driver registration</span>
        <h1>Build your driver profile.</h1>
        <p>Enter the official references exactly as they appear on your documents. Verification files are handled separately through LibSwiftRide&apos;s restricted KYC process.</p>
        <div className="form-row"><label>Driver licence number<input value={licenseNumber} minLength={4} required onChange={(event) => setLicenseNumber(event.target.value)} /></label><label>National ID reference<input value={nationalIdRef} minLength={4} required onChange={(event) => setNationalIdRef(event.target.value)} /></label></div>
        <Action disabled={licenseNumber.length < 4 || nationalIdRef.length < 4} onClick={startOnboarding}>Continue to verification</Action>
      </section>}
      {onboarding && !onboarding.verifiedAt && <section className="panel verification-status">
        <span className="eyebrow">Driver verification</span><h2>{onboarding.kycCase?.status === "SUBMITTED" ? "Documents under review" : "Verification required"}</h2>
        <p>Status: <strong>{onboarding.kycCase?.status ?? "DRAFT"}</strong> · Step: {onboarding.onboardingStep}</p>
        <div className="verification-checklist">
          {([["DRIVER_LICENSE", "Driver license"], ["VEHICLE_REGISTRATION", "Vehicle registration"], ["INSURANCE", "Insurance document"], ["INSPECTION", "Vehicle photos / inspection"], ["PROFILE_PHOTO", "Profile photo"]] as const).map(([type, label]) => {
            const complete = onboarding.kycCase?.documents.some((document) => document.type === type);
            return <div key={type} className={complete ? "complete" : ""}><span>{complete ? "✓" : "○"}</span><strong>{label}</strong><small>{complete ? "Received" : "Required"}</small></div>;
          })}
          <div className={onboarding.kycCase?.status === "APPROVED" ? "complete" : ""}><span>{onboarding.kycCase?.status === "APPROVED" ? "✓" : "○"}</span><strong>Admin approval</strong><small>{onboarding.kycCase?.status === "SUBMITTED" ? "Under review" : "Pending"}</small></div>
        </div>
        {onboarding.kycCase?.rejectionNotes && <p className="notice error">{onboarding.kycCase.rejectionNotes}</p>}
        {!kycUploadConfig?.enabled && <p className="notice error">Private document storage and scanning are not configured. Upload is safely disabled.</p>}
        {kycUploadConfig?.fictionalOnly && <p className="notice"><strong>Staging test only:</strong> upload fictional documents containing no real identity, licence, insurance, address, or vehicle information.</p>}
        {kycUploadConfig?.fictionalOnly && <label className="consent-row"><input type="checkbox" checked={fictionalConfirmed} onChange={(event) => setFictionalConfirmed(event.target.checked)} /> I confirm every file is fictional test data.</label>}
        <div className="kyc-upload-grid">
          {([[
            "DRIVER_LICENSE", "Driver licence", "Photograph or select a fictional driver licence.", undefined
          ], [
            "VEHICLE_REGISTRATION", "Vehicle registration", "Select a fictional registration document.", undefined
          ], [
            "INSURANCE", "Insurance document", "Select a fictional insurance document.", undefined
          ], [
            "INSPECTION", "Vehicle photo / inspection", "Show a fictional test vehicle in good lighting.", "environment"
          ], [
            "PROFILE_PHOTO", "Profile photo", "Use a fictional test portrait; do not upload a real person.", "user"
          ]] as const).map(([type, label, help, capture]) => {
            const document = onboarding.kycCase?.documents.find((item) => item.type === type);
            return <label className="kyc-upload-card" key={type}>
              <strong>{label}</strong><span>{help}</span>
              <small>{document?.scanStatus === "CLEAN" ? `Security scan passed · ${Math.ceil(document.sizeBytes / 1024)} KB` : "Required · JPEG, PNG, or PDF"}</small>
              <input type="file" accept={kycUploadConfig?.mimeTypes.join(",") ?? "image/jpeg,image/png,application/pdf"} capture={capture} disabled={!kycUploadConfig?.enabled || (kycUploadConfig.fictionalOnly && !fictionalConfirmed) || uploadingType !== null || ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(onboarding.kycCase?.status ?? "")} onChange={(event) => { void uploadKycDocument(type, event.target.files?.[0]); event.currentTarget.value = ""; }} />
              {uploadingType === type && <span role="status">Uploading and scanning…</span>}
            </label>;
          })}
        </div>
        <Action disabled={["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(onboarding.kycCase?.status ?? "") || uploadingType !== null || !(["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"] as const).every((type) => onboarding.kycCase?.documents.some((document) => document.type === type && document.scanStatus === "CLEAN"))} onClick={submitKyc}>Submit for Admin review</Action>
      </section>}
      <div hidden={onboarding === null}>
      {incomingRide && <section className="incoming-ride" aria-live="assertive">
        <div><span className="eyebrow">Incoming ride request · {offerSeconds}s</span><h1>{incomingRide.passenger.firstName} needs a ride</h1><p>{incomingRide.pickupAddress} → {incomingRide.destinationAddress}</p></div>
        <div className="offer-metrics"><span><small>Estimated time</small><strong>{Math.max(1, Math.round(incomingRide.estimatedDurationSec / 60))} min</strong></span><span><small>Trip distance</small><strong>{(incomingRide.estimatedDistanceM / 1000).toFixed(1)} km</strong></span><span><small>Your earnings</small><strong>{money(incomingRide.driverEarningsMinor)}</strong></span><span><small>Payment</small><strong>{incomingRide.paymentMethod.replaceAll("_", " ")}</strong></span></div>
        <div className="offer-actions"><Action disabled={!networkOnline} onClick={() => respondToOffer("accept")}>Accept ride</Action><button className="reject-offer" disabled={!networkOnline} onClick={() => respondToOffer("reject")}>Decline</button></div>
      </section>}
      <div className="toolbar">
        <div><span className="eyebrow">Driver dashboard</span><h1>Welcome{dashboard?.driver.firstName ? `, ${dashboard.driver.firstName}` : ""}.</h1><p>Current location: Monrovia</p></div>
        <Action className={online ? "availability-online" : ""} disabled={!networkOnline || dashboard?.driver.status === "ON_TRIP"} onClick={() => setAvailability(online ? "OFFLINE" : "AVAILABLE")}>{dashboard?.driver.status === "ON_TRIP" ? "Trip active" : online ? "● Online — go offline" : "Go online"}</Action>
      </div>
      <p className={`notice gps-status gps-${gpsStatus}`} aria-live="polite"><strong>Live GPS:</strong> {gpsStatus === "live" ? `sharing securely${gpsAccuracyM != null ? ` · accuracy about ${gpsAccuracyM} m` : ""}${lastLocationAt ? ` · updated ${lastLocationAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}` : gpsStatus === "requesting" ? "waiting for device permission…" : gpsStatus === "blocked" ? "permission blocked" : gpsStatus === "unavailable" ? "device signal unavailable" : "off — location is not being shared"}</p>
      {message && <p className="notice">{message}</p>}
      <div className="grid">
        <Stat label="Today" value={money(dashboard?.earnings.today.driverEarningsMinor ?? 0)} detail={`${dashboard?.earnings.today.completedRides ?? 0} completed rides`} />
        <Stat label="Last 7 days" value={money(dashboard?.earnings.lastSevenDays.driverEarningsMinor ?? 0)} detail={`${dashboard?.earnings.lastSevenDays.completedRides ?? 0} completed rides`} />
        <Stat label="Wallet balance" value={money(dashboard?.wallet.balanceMinor ?? 0)} detail="Available ledger balance" />
        <Stat label="Rating" value={dashboard?.rating.average?.toFixed(2) ?? "—"} detail={`${dashboard?.rating.count ?? 0} reviews`} />
      </div>
      <section className="hero">
        <Map {...coords} label="Driver location" />
        <div className="panel">
          <span className="eyebrow">Current assignment</span>
          {dashboard?.activeRide && !incomingRide ? <>
            <h2>{dashboard.activeRide.status.replaceAll("_", " ")}</h2>
            <p>{dashboard.activeRide.pickupAddress} → {dashboard.activeRide.destinationAddress}</p>
            <p><strong>{money(dashboard.activeRide.fareMinor)}</strong></p>
            {activeNextStatus && <Action disabled={!networkOnline} onClick={advanceRide}>Mark {activeNextStatus.replaceAll("_", " ").toLowerCase()}</Action>}
            {dashboard.activeRide.status === "DRIVER_ARRIVED" && <p>Waiting for the passenger to confirm boarding.</p>}
            {navigationUrl && <a className="action navigation-link" href={navigationUrl} target="_blank" rel="noreferrer">Open turn-by-turn navigation</a>}
            <a className="action contact-link" href={`tel:${dashboard.activeRide.passenger.phone}`}>Call passenger</a>
            <div className="toolbar"><button onClick={sos}>SOS</button><button className="link-button" onClick={() => rideAction("CANCELLED")}>Cancel ride</button></div>
          </> : <p>No active ride. Stay online to receive a match.</p>}
          <p>Verification: {dashboard?.driver.kycStatus ?? "not started"} · Vehicle: {dashboard?.driver.vehicle?.plateNumber ?? "not assigned"}</p>
          <p>{dashboard?.unreadNotifications ?? 0} unread notifications</p>
        </div>
      </section>
      {dashboard?.activeRide && <section className="panel" aria-live="polite">
        <h2>Passenger chat</h2>
        {chatMessages.map((chat) => <p key={chat.id}>{chat.content}<br /><small>{new Date(chat.createdAt).toLocaleTimeString("en-LR")}</small></p>)}
        <div className="form-row"><label>Message<input value={chatInput} maxLength={500} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendChat(); }} /></label><Action onClick={sendChat}>Send</Action></div>
      </section>}
      <section className="panel">
        <h2>Availability schedule</h2>
        <div className="form-row"><label>Start<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>End<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
        <Action onClick={addAvailability}>Add availability</Action>
        {schedule.map((window) => <p key={window.id}>{new Date(window.startsAt).toLocaleString("en-LR")} – {new Date(window.endsAt).toLocaleString("en-LR")}</p>)}
      </section>
      <section className="panel">
        <div className="toolbar"><h2>Performance and ride history</h2><strong>{Math.round((dashboard?.performance.completionRate ?? 0) * 100)}% completion</strong></div>
        <table><thead><tr><th>Route</th><th>Status</th><th>Earnings</th></tr></thead><tbody>{history.map((ride) => <tr key={ride.id}><td>{ride.pickupAddress} → {ride.destinationAddress}</td><td>{ride.status.replaceAll("_", " ")}</td><td>{money(ride.driverEarningsMinor)}</td></tr>)}</tbody></table>
      </section>
      <section className="panel"><h2>Incentives and bonuses</h2>
        {incentives.map((program) => <p key={program.id}><strong>{program.name}</strong> · {Math.min(program.completedRides, program.minimumRides)}/{program.minimumRides} rides · {money(program.bonusMinor)} bonus · {program.awarded ? "Awarded" : `ends ${new Date(program.endsAt).toLocaleDateString("en-LR")}`}</p>)}
        {!incentives.length && <p>No active incentive programs.</p>}
      </section>
      </div>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
