import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Ride = { id: string; status: string; pickupAddress: string; destinationAddress: string; fareMinor: number; requestedAt: string; passenger: { firstName: string; lastName: string }; driver?: { user: { firstName: string; lastName: string }; vehicle?: { plateNumber: string } } };
type Driver = { id: string; user: { firstName: string; lastName: string }; vehicle: { make: string; model: string; plateNumber: string } | null; location: { latitude: number; longitude: number; at: string } | null };

function App() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    const [queue, available] = await Promise.all([
      apiClient.request<{ data: Ride[] }>("/dispatch/rides"),
      apiClient.request<{ data: Driver[] }>("/dispatch/drivers")
    ]);
    setRides(queue.data);
    setDrivers(available.data);
    setError("");
  }

  useEffect(() => {
    let active = true;
    const refresh = () => load().catch((requestError: Error) => active && setError(requestError.message));
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  async function assign(rideId: string) {
    const driverId = selectedDrivers[rideId];
    if (!driverId) return setError("Select an available driver first.");
    try {
      await apiClient.request(`/dispatch/rides/${rideId}/assign`, { method: "POST", body: JSON.stringify({ driverId }) });
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }

  async function setDriverStatus(driverId: string, status: "OFFLINE" | "SUSPENDED") {
    try {
      await apiClient.request(`/dispatch/drivers/${driverId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (requestError) { setError((requestError as Error).message); }
  }

  const searching = rides.filter((ride) => ride.status === "SEARCHING").length;
  return (
    <Shell product="Dispatcher">
      <span className="eyebrow">Live dispatch</span><h1>Move every ride forward.</h1>
      {error && <p className="notice error">{error}</p>}
      <div className="grid">
        <Stat label="Open rides" value={String(rides.length)} />
        <Stat label="Awaiting driver" value={String(searching)} />
        <Stat label="Available drivers" value={String(drivers.length)} />
      </div>
      <section className="hero">
        <div className="panel">
          <h2>Dispatch queue</h2>
          <table><thead><tr><th>Passenger</th><th>Route</th><th>Status</th><th>Fare</th><th>Assignment</th></tr></thead>
            <tbody>{rides.map((ride) => <tr key={ride.id}>
              <td>{ride.passenger.firstName} {ride.passenger.lastName}</td>
              <td>{ride.pickupAddress} → {ride.destinationAddress}</td>
              <td>{ride.status.replaceAll("_", " ")}</td>
              <td>{money(ride.fareMinor)}</td>
              <td>{ride.status === "SEARCHING" ? <div className="toolbar">
                <select aria-label="Available driver" value={selectedDrivers[ride.id] ?? ""} onChange={(event) => setSelectedDrivers((current) => ({ ...current, [ride.id]: event.target.value }))}>
                  <option value="">Select driver</option>
                  {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.user.firstName} {driver.user.lastName} · {driver.vehicle?.plateNumber ?? "No plate"}</option>)}
                </select>
                <button className="action" onClick={() => assign(ride.id)}>Assign</button>
              </div> : ride.driver ? `${ride.driver.user.firstName} ${ride.driver.user.lastName}` : "Matching"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="panel">
          <Map {...(drivers.find((driver) => driver.location)?.location ?? {})} label="Live available driver map" />
          <h2>Driver status</h2>
          {drivers.map((driver) => <div className="toolbar" key={driver.id}><span>{driver.user.firstName} {driver.user.lastName} · {driver.location ? "GPS live" : "GPS stale"}</span><span><button className="link-button" onClick={() => setDriverStatus(driver.id, "OFFLINE")}>Set offline</button> · <button className="link-button" onClick={() => setDriverStatus(driver.id, "SUSPENDED")}>Suspend</button></span></div>)}
        </div>
      </section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
