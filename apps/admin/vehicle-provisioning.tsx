import React, { useEffect, useState } from "react";
import { apiClient } from "@libswiftride/sdk";

type ApprovedCase = { id: string; driver: { id: string; user: { firstName: string; lastName: string } } };
export function VehicleProvisioning() {
  const [cases, setCases] = useState<ApprovedCase[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try { setCases((await apiClient.request<{ data: ApprovedCase[] }>("/admin/kyc?status=APPROVED")).data); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load approved drivers"); }
  }
  useEffect(() => { void refresh(); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, FormDataEntryValue> = {};
    form.forEach((value, key) => { body[key] = value; });
    try {
      await apiClient.request(`/admin/drivers/${String(body.driverId)}/vehicle`, { method: "POST", body: JSON.stringify({ make: body.make, model: body.model, year: Number(body.year), color: body.color, plateNumber: body.plateNumber, evidenceReference: body.evidenceReference,
        insuranceExpiresAt: `${body.insuranceExpiresAt}T23:59:59.999Z`, inspectionExpiresAt: `${body.inspectionExpiresAt}T23:59:59.999Z`, registrationExpiresAt: `${body.registrationExpiresAt}T23:59:59.999Z` }) });
      setMessage("Vehicle compliance recorded. The driver can now request to go online.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vehicle verification failed"); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Vehicle compliance</h2><p>Review the approved driver's documents before recording the vehicle and expiry dates.</p>
    <button type="button" onClick={() => void refresh()}>Refresh approved drivers</button>
    <form onSubmit={(event) => void submit(event)}>
      <label>Approved driver<select name="driverId" required defaultValue=""><option value="" disabled>Select a driver</option>{cases.map((item) => <option key={item.id} value={item.driver.id}>{item.driver.user.firstName} {item.driver.user.lastName}</option>)}</select></label>
      <label>Make<input name="make" required maxLength={80} /></label><label>Model<input name="model" required maxLength={80} /></label>
      <label>Year<input name="year" required type="number" min={1990} max={new Date().getUTCFullYear() + 1} /></label>
      <label>Color<input name="color" required maxLength={40} /></label><label>Plate number<input name="plateNumber" required minLength={3} maxLength={30} /></label>
      <label>Insurance expiry<input name="insuranceExpiresAt" required type="date" /></label>
      <label>Inspection expiry<input name="inspectionExpiresAt" required type="date" /></label>
      <label>Registration expiry<input name="registrationExpiresAt" required type="date" /></label>
      <label>Review reference<input name="evidenceReference" required minLength={8} maxLength={200} /></label>
      <button className="action" disabled={busy || !cases.length}>{busy ? "Recording…" : "Verify vehicle compliance"}</button>
    </form>{message && <p role="status">{message}</p>}
  </section>;
}
