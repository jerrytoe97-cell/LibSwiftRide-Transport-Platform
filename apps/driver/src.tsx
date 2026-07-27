import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Action, Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type ActiveRide = { id: string; status: string; pickupAddress: string; destinationAddress: string; fareMinor: number };
type Dashboard = {
  driver: { status: string; verifiedAt: string | null; kycStatus: string | null; vehicle: { plateNumber: string } | null };
  earnings: { driverEarningsMinor: number; completedRides: number; currency: string };
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

const nextStatus: Record<string, string> = {
  DRIVER_ASSIGNED: "DRIVER_ARRIVING",
  DRIVER_ARRIVING: "DRIVER_ARRIVED",
  PASSENGER_BOARDED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED"
};

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("Sign in to load your driver profile.");
  const [coords, setCoords] = useState({ latitude: 6.3156, longitude: -10.8074 });
  const [schedule, setSchedule] = useState<AvailabilityWindow[]>([]);
  const [history, setHistory] = useState<RideHistory[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const watchId = useRef<number | null>(null);

  async function load() {
    if (!apiClient.hasSession()) return;
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
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  async function setAvailability(status: "AVAILABLE" | "OFFLINE") {
    try {
      await apiClient.request("/drivers/me/availability", { method: "POST", body: JSON.stringify({ status }) });
      if (status === "OFFLINE") {
        socket.current?.close();
        socket.current = null;
        if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      } else {
        const connection = apiClient.connect();
        socket.current = connection;
        connection.onopen = () => {
          if (dashboard?.activeRide) connection.send(JSON.stringify({ type: "ride.subscribe", rideId: dashboard.activeRide.id }));
          watchId.current = navigator.geolocation.watchPosition((position) => {
            const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            setCoords(location);
            connection.send(JSON.stringify({ type: "driver.location", ...location, heading: position.coords.heading, speedMps: position.coords.speed }));
          }, () => setMessage("Location permission is required while online."), { enableHighAccuracy: true, maximumAge: 5_000 });
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
  return (
    <Shell product="Driver" demoRole="DRIVER">
      <div className="toolbar">
        <div><span className="eyebrow">Driver home</span><h1>Earn on your schedule.</h1></div>
        <Action onClick={() => setAvailability(online ? "OFFLINE" : "AVAILABLE")}>{online ? "Go offline" : "Go online"}</Action>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="grid">
        <Stat label="Lifetime earnings" value={money(dashboard?.earnings.driverEarningsMinor ?? 0)} detail={`${dashboard?.earnings.completedRides ?? 0} completed rides`} />
        <Stat label="Wallet balance" value={money(dashboard?.wallet.balanceMinor ?? 0)} detail="Available ledger balance" />
        <Stat label="Rating" value={dashboard?.rating.average?.toFixed(2) ?? "—"} detail={`${dashboard?.rating.count ?? 0} reviews`} />
      </div>
      <section className="hero">
        <Map {...coords} label="Driver location" />
        <div className="panel">
          <span className="eyebrow">Current assignment</span>
          {dashboard?.activeRide ? <>
            <h2>{dashboard.activeRide.status.replaceAll("_", " ")}</h2>
            <p>{dashboard.activeRide.pickupAddress} → {dashboard.activeRide.destinationAddress}</p>
            <p><strong>{money(dashboard.activeRide.fareMinor)}</strong></p>
            {activeNextStatus && <Action onClick={advanceRide}>Mark {activeNextStatus.replaceAll("_", " ").toLowerCase()}</Action>}
            {dashboard.activeRide.status === "DRIVER_ARRIVED" && <p>Waiting for the passenger to confirm boarding.</p>}
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
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
