import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Driver = { id: string; status: string; user: { firstName: string; lastName: string }; vehicle?: { plateNumber: string } };
type Fleet = { id: string; name: string; drivers: Driver[]; vehicles: { id: string; plateNumber: string; make: string; model: string; active: boolean }[] };
type Report = { rides: number; completedRides: number; grossBookingsMinor: number; driverEarningsMinor: number; platformCommissionMinor: number };

function App() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [driverId, setDriverId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const [overview, operations] = await Promise.all([
      apiClient.request<{ data: Fleet[] }>("/fleet/overview"),
      apiClient.request<{ data: Report }>(`/reports/operations?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
    ]);
    setFleets(overview.data);
    setReport(operations.data);
  }

  useEffect(() => { load().catch((requestError: Error) => setError(requestError.message)); }, []);

  async function assignDriver() {
    if (!fleets[0] || !driverId) return;
    try {
      await apiClient.request("/fleet/drivers", { method: "POST", body: JSON.stringify({ fleetId: fleets[0].id, driverId }) });
      setDriverId("");
      await load();
    } catch (requestError) { setError((requestError as Error).message); }
  }

  async function removeDriver(id: string) {
    try {
      await apiClient.request(`/fleet/drivers/${id}`, { method: "DELETE" });
      await load();
    } catch (requestError) { setError((requestError as Error).message); }
  }

  const drivers = fleets.flatMap((fleet) => fleet.drivers);
  const vehicles = fleets.flatMap((fleet) => fleet.vehicles);
  return <Shell product="Fleet">
    <span className="eyebrow">Fleet owner portal</span><h1>Keep every driver and vehicle moving.</h1>
    {error && <p className="notice error">{error}</p>}
    <div className="grid">
      <Stat label="Online drivers" value={String(drivers.filter((driver) => driver.status === "AVAILABLE").length)} detail={`${drivers.length} managed drivers`} />
      <Stat label="30-day earnings" value={money(report?.driverEarningsMinor ?? 0)} detail={`${report?.completedRides ?? 0} completed rides`} />
      <Stat label="Platform commission" value={money(report?.platformCommissionMinor ?? 0)} detail="Enforced at 12%" />
    </div>
    <section className="hero"><Map label="Fleet map" /><div className="panel">
      <h2>Add an existing driver</h2>
      <p>Only verified, unassigned drivers can join the fleet. Active-trip drivers cannot be moved.</p>
      <label>Driver ID<input value={driverId} onChange={(event) => setDriverId(event.target.value)} /></label>
      <button className="action" onClick={assignDriver} disabled={!driverId}>Assign driver</button>
    </div></section>
    <section className="panel"><h2>Managed drivers</h2>
      <table><thead><tr><th>Driver</th><th>Vehicle</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {drivers.map((driver) => <tr key={driver.id}><td>{driver.user.firstName} {driver.user.lastName}</td><td>{driver.vehicle?.plateNumber ?? "Unassigned"}</td><td>{driver.status}</td><td><button className="link-button" disabled={driver.status === "ON_TRIP"} onClick={() => removeDriver(driver.id)}>Remove</button></td></tr>)}
      </tbody></table>
    </section>
    <section className="panel"><h2>Vehicles</h2>
      <table><thead><tr><th>Vehicle</th><th>Plate</th><th>Status</th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id}><td>{vehicle.make} {vehicle.model}</td><td>{vehicle.plateNumber}</td><td>{vehicle.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table>
    </section>
  </Shell>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
