import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Action, Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type ActiveRide = { id: string; status: string; pickupAddress: string; destinationAddress: string; fareMinor: number };
type Dashboard = {
  driver: { status: string; verifiedAt: string | null; kycStatus: string | null; vehicle: { plateNumber: string } | null };
  earnings: { driverEarningsMinor: number; completedRides: number; currency: string };
  rating: { average: number | null; count: number };
  activeRide: ActiveRide | null;
  unreadNotifications: number;
};

const nextStatus: Record<string, string> = {
  DRIVER_ASSIGNED: "DRIVER_ARRIVING",
  DRIVER_ARRIVING: "DRIVER_ARRIVED",
  DRIVER_ARRIVED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED"
};

function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("Sign in to load your driver profile.");
  const [coords, setCoords] = useState({ latitude: 6.3156, longitude: -10.8074 });
  const socket = useRef<WebSocket | null>(null);
  const watchId = useRef<number | null>(null);

  async function load() {
    if (!apiClient.hasSession()) return;
    const response = await apiClient.request<{ data: Dashboard }>("/drivers/me/dashboard");
    setDashboard(response.data);
    setMessage("");
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
          watchId.current = navigator.geolocation.watchPosition((position) => {
            const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            setCoords(location);
            connection.send(JSON.stringify({ type: "driver.location", ...location }));
          }, () => setMessage("Location permission is required while online."), { enableHighAccuracy: true, maximumAge: 5_000 });
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

  const online = dashboard?.driver.status === "AVAILABLE";
  const activeNextStatus = dashboard?.activeRide ? nextStatus[dashboard.activeRide.status] : undefined;
  return (
    <Shell product="Driver">
      <div className="toolbar">
        <div><span className="eyebrow">Driver home</span><h1>Earn on your schedule.</h1></div>
        <Action onClick={() => setAvailability(online ? "OFFLINE" : "AVAILABLE")}>{online ? "Go offline" : "Go online"}</Action>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="grid">
        <Stat label="Lifetime earnings" value={money(dashboard?.earnings.driverEarningsMinor ?? 0)} detail={`${dashboard?.earnings.completedRides ?? 0} completed rides`} />
        <Stat label="Your fare share" value="88%" detail="settled to your wallet" />
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
          </> : <p>No active ride. Stay online to receive a match.</p>}
          <p>Verification: {dashboard?.driver.kycStatus ?? "not started"} · Vehicle: {dashboard?.driver.vehicle?.plateNumber ?? "not assigned"}</p>
          <p>{dashboard?.unreadNotifications ?? 0} unread notifications</p>
        </div>
      </section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
