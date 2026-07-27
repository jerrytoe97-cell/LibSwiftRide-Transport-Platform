import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Overview = {
  activeRides: number;
  availableDrivers: number;
  completedRides: number;
  grossBookingsMinor: number;
  averageRating: number | null;
};
type PaymentSettings = {
  source: "environment";
  restartRequired: boolean;
  mobileMoney: Array<{
    method: "ORANGE_MONEY" | "MTN_MOMO";
    environmentVariable: string;
    configured: boolean;
  }>;
};
type OperationsReport = {
  rides: number;
  completedRides: number;
  completionRate: number;
  grossBookingsMinor: number;
  driverEarningsMinor: number;
  platformCommissionMinor: number;
};
type Promotion = { id: string; code: string; description: string; active: boolean; uses: number; maxUses: number | null; expiresAt: string };
type Passenger = { id: string; firstName: string; lastName: string; phone: string; status: string; _count: { rides: number } };
type Review = { id: string; score: number; comment: string | null; author: { firstName: string; lastName: string }; subject: { firstName: string; lastName: string } };
type KycCase = { id: string; driver: { user: { firstName: string; lastName: string } }; submittedAt: string };
type Analytics = {
  rides: { total: number; completed: number; cancelled: number; uniquePassengers: number; activeDrivers: number; averageAcceptanceSec: number | null; averageTripSec: number | null };
  revenue: { discountsMinor: number; waitingFeesMinor: number; tollsMinor: number };
  growth: { newPassengers: number; newDrivers: number };
  safetyIncidents: number;
};
type AdvancedAnalytics = {
  rides: Array<{ serviceType: string; status: string; _count: number; _sum: { fareMinor: number | null } }>;
  deliveries: Array<{ status: string; _count: number; _sum: { fareMinor: number | null } }>;
  corporate: { _count: number; _sum: { fareMinor: number | null } };
  incentives: { _count: number; _sum: { amountMinor: number | null } };
  campaigns: { _count: number; _sum: { budgetMinor: number | null; spentMinor: number | null } };
  fraud: Array<{ action: string; _count: number }>;
};
type CommissionSettings = { enforced: { driverShareBps: number; companyCommissionBps: number }; editable: false; history: Array<{ id: string; effectiveAt: string; reason: string }> };
type FraudSignal = { id: string; rule: string; score: number; action: string; entityType: string; createdAt: string };

function App() {
  const [data, setData] = useState<Overview>({ activeRides: 0, availableDrivers: 0, completedRides: 0, grossBookingsMinor: 0, averageRating: null });
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [report, setReport] = useState<OperationsReport | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [kycCases, setKycCases] = useState<KycCase[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedAnalytics | null>(null);
  const [commission, setCommission] = useState<CommissionSettings | null>(null);
  const [fraudSignals, setFraudSignals] = useState<FraudSignal[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastRole, setBroadcastRole] = useState("PASSENGER");
  const [error, setError] = useState("");

  useEffect(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    Promise.all([
      apiClient.request<{ data: Overview }>("/admin/overview"),
      apiClient.request<{ data: PaymentSettings }>("/admin/settings/payments"),
      apiClient.request<{ data: OperationsReport }>(`/reports/operations?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
      apiClient.request<{ data: Promotion[] }>("/admin/promos"),
      apiClient.request<{ data: Passenger[] }>("/admin/passengers"),
      apiClient.request<{ data: Review[] }>("/admin/reviews?status=PENDING"),
      apiClient.request<{ data: KycCase[] }>("/admin/kyc?status=SUBMITTED"),
      apiClient.request<{ data: Analytics }>(`/reports/analytics?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
      apiClient.request<{ data: AdvancedAnalytics }>(`/reports/advanced?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
      apiClient.request<{ data: CommissionSettings }>("/admin/settings/commission"),
      apiClient.request<{ data: FraudSignal[] }>("/admin/fraud-signals")
    ]).then(([overview, settings, operations, promoList, passengerList, reviewList, kycList, analyticsReport, advancedReport, commissionSettings, signals]) => {
      setData(overview.data);
      setPaymentSettings(settings.data);
      setReport(operations.data);
      setPromotions(promoList.data);
      setPassengers(passengerList.data); setReviews(reviewList.data); setKycCases(kycList.data);
      setAnalytics(analyticsReport.data);
      setAdvanced(advancedReport.data); setCommission(commissionSettings.data); setFraudSignals(signals.data);
    }).catch((requestError: Error) => setError(requestError.message));
  }, []);

  async function patch(path: string, body: unknown) {
    await apiClient.request(path, { method: "PATCH", body: JSON.stringify(body) });
    window.location.reload();
  }

  async function reviewKyc(id: string, decision: "APPROVED" | "REJECTED") {
    await apiClient.request(`/admin/kyc/${id}/review`, { method: "POST", body: JSON.stringify({ decision, ...(decision === "REJECTED" ? { rejectionCode: "DOCUMENT_REVIEW_REQUIRED" } : {}) }) });
    window.location.reload();
  }

  async function sendBroadcast() {
    try {
      await apiClient.request("/admin/notifications", { method: "POST", body: JSON.stringify({ role: broadcastRole, title: broadcastTitle, body: broadcastBody, push: true }) });
      setBroadcastTitle(""); setBroadcastBody("");
    } catch (requestError) { setError((requestError as Error).message); }
  }

  return (
    <Shell product="Admin" demoRole="ADMIN">
      <div className="toolbar">
        <div><span className="eyebrow">Live operations</span><h1>Monrovia at a glance.</h1></div>
        <span>Safety · Payments · Access · Audit</span>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="grid">
        <Stat label="Active rides" value={String(data.activeRides)} />
        <Stat label="Available drivers" value={String(data.availableDrivers)} />
        <Stat label="Gross bookings" value={money(data.grossBookingsMinor)} />
      </div>
      <section className="hero">
        <Map label="Operations map" />
        <div className="panel">
          <h2>Service analytics</h2>
          <table><tbody>
            <tr><th>Completed rides</th><td>{data.completedRides}</td></tr>
            <tr><th>Average rating</th><td>{data.averageRating?.toFixed(2) ?? "—"}</td></tr>
            <tr><th>Platform commission</th><td>12%</td></tr>
            <tr><th>Driver allocation</th><td>88%</td></tr>
          </tbody></table>
          <p>Privileged changes write append-only audit records.</p>
        </div>
      </section>
      <section className="panel">
        <span className="eyebrow">30-day report</span>
        <h2>Ride and revenue performance</h2>
        <div className="grid">
          <Stat label="Completion rate" value={`${Math.round((report?.completionRate ?? 0) * 100)}%`} detail={`${report?.completedRides ?? 0} of ${report?.rides ?? 0} rides`} />
          <Stat label="Driver earnings" value={money(report?.driverEarningsMinor ?? 0)} detail="88% allocation" />
          <Stat label="Platform commission" value={money(report?.platformCommissionMinor ?? 0)} detail="12% allocation" />
        </div>
      </section>
      <section className="panel">
        <span className="eyebrow">30-day operational intelligence</span>
        <h2>Passenger, driver and ride analytics</h2>
        <div className="grid">
          <Stat label="Unique passengers" value={String(analytics?.rides.uniquePassengers ?? 0)} detail={`${analytics?.growth.newPassengers ?? 0} new passengers`} />
          <Stat label="Active drivers" value={String(analytics?.rides.activeDrivers ?? 0)} detail={`${analytics?.growth.newDrivers ?? 0} newly onboarded`} />
          <Stat label="Average acceptance" value={analytics?.rides.averageAcceptanceSec == null ? "—" : `${analytics.rides.averageAcceptanceSec}s`} detail={`${analytics?.rides.cancelled ?? 0} cancellations`} />
          <Stat label="Fare adjustments" value={money((analytics?.revenue.waitingFeesMinor ?? 0) + (analytics?.revenue.tollsMinor ?? 0))} detail={`${money(analytics?.revenue.discountsMinor ?? 0)} discounts`} />
          <Stat label="Safety incidents" value={String(analytics?.safetyIncidents ?? 0)} detail="Requires operations review" />
        </div>
      </section>
      <section className="panel">
        <span className="eyebrow">Advanced business intelligence</span>
        <h2>Corporate, delivery and risk operations</h2>
        <div className="grid">
          <Stat label="Corporate rides" value={String(advanced?.corporate._count ?? 0)} detail={money(advanced?.corporate._sum.fareMinor ?? 0)} />
          <Stat label="Deliveries" value={String(advanced?.deliveries.reduce((sum, row) => sum + row._count, 0) ?? 0)} detail={money(advanced?.deliveries.reduce((sum, row) => sum + (row._sum.fareMinor ?? 0), 0) ?? 0)} />
          <Stat label="Incentive awards" value={String(advanced?.incentives._count ?? 0)} detail={money(advanced?.incentives._sum.amountMinor ?? 0)} />
          <Stat label="Campaign spend" value={money(advanced?.campaigns._sum.spentMinor ?? 0)} detail={`${advanced?.campaigns._count ?? 0} campaigns`} />
          <Stat label="Fraud signals" value={String(advanced?.fraud.reduce((sum, row) => sum + row._count, 0) ?? 0)} detail="Queued for review" />
        </div>
      </section>
      <section className="panel">
        <span className="eyebrow">Financial controls</span>
        <h2>Commission configuration</h2>
        <p>The production split is locked by API validation and database constraints. Changes require a reviewed release, not a dashboard override.</p>
        <table><tbody><tr><th>Driver share</th><td>{(commission?.enforced.driverShareBps ?? 8800) / 100}%</td></tr><tr><th>Company commission</th><td>{(commission?.enforced.companyCommissionBps ?? 1200) / 100}%</td></tr><tr><th>Editable at runtime</th><td>No</td></tr></tbody></table>
      </section>
      <section className="panel">
        <span className="eyebrow">Fraud operations</span><h2>Signals awaiting review</h2>
        <table><thead><tr><th>Rule</th><th>Entity</th><th>Score</th><th>Action</th><th>Review</th></tr></thead><tbody>{fraudSignals.map((signal) => <tr key={signal.id}><td>{signal.rule}</td><td>{signal.entityType}</td><td>{signal.score}</td><td>{signal.action}</td><td><button className="link-button" onClick={() => patch(`/admin/fraud-signals/${signal.id}/review`, {})}>Mark reviewed</button></td></tr>)}</tbody></table>
      </section>
      <section className="panel">
        <h2>Driver approvals</h2>
        {kycCases.map((kyc) => <div className="toolbar" key={kyc.id}><span>{kyc.driver.user.firstName} {kyc.driver.user.lastName}</span><span><button className="action" onClick={() => reviewKyc(kyc.id, "APPROVED")}>Approve</button> <button className="link-button" onClick={() => reviewKyc(kyc.id, "REJECTED")}>Reject</button></span></div>)}
        {!kycCases.length && <p>No submitted driver cases.</p>}
      </section>
      <section className="panel">
        <h2>Admin notifications</h2>
        <div className="form">
          <label>Audience<select value={broadcastRole} onChange={(event) => setBroadcastRole(event.target.value)}><option value="PASSENGER">Passengers</option><option value="DRIVER">Drivers</option><option value="FLEET_MANAGER">Fleet managers</option><option value="DISPATCHER">Dispatchers</option><option value="SUPPORT">Support</option></select></label>
          <label>Title<input value={broadcastTitle} maxLength={120} onChange={(event) => setBroadcastTitle(event.target.value)} /></label>
          <label>Message<textarea value={broadcastBody} maxLength={500} onChange={(event) => setBroadcastBody(event.target.value)} /></label>
          <button className="action" onClick={sendBroadcast} disabled={!broadcastTitle.trim() || !broadcastBody.trim()}>Send in-app and sandbox push</button>
        </div>
      </section>
      <section className="panel">
        <h2>Passenger management</h2>
        <table><thead><tr><th>Passenger</th><th>Phone</th><th>Rides</th><th>Status</th><th>Action</th></tr></thead><tbody>{passengers.map((passenger) => <tr key={passenger.id}><td>{passenger.firstName} {passenger.lastName}</td><td>{passenger.phone}</td><td>{passenger._count.rides}</td><td>{passenger.status}</td><td><button className="link-button" onClick={() => patch(`/admin/passengers/${passenger.id}/status`, { status: passenger.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}>{passenger.status === "ACTIVE" ? "Suspend" : "Activate"}</button></td></tr>)}</tbody></table>
      </section>
      <section className="panel">
        <h2>Review moderation</h2>
        {reviews.map((review) => <div key={review.id}><p><strong>{review.score}/5</strong> · {review.author.firstName} → {review.subject.firstName}<br />{review.comment}</p><button className="link-button" onClick={() => patch(`/admin/reviews/${review.id}`, { status: "PUBLISHED" })}>Publish</button> · <button className="link-button" onClick={() => patch(`/admin/reviews/${review.id}`, { status: "HIDDEN" })}>Hide</button></div>)}
        {!reviews.length && <p>No reviews awaiting moderation.</p>}
      </section>
      <section className="panel">
        <span className="eyebrow">Promotions</span>
        <h2>Coupon performance</h2>
        <table><thead><tr><th>Code</th><th>Description</th><th>Uses</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>{promotions.map((promotion) => <tr key={promotion.id}>
            <td><code>{promotion.code}</code></td><td>{promotion.description}</td>
            <td>{promotion.uses}{promotion.maxUses ? ` / ${promotion.maxUses}` : ""}</td>
            <td>{new Date(promotion.expiresAt).toLocaleDateString("en-LR")}</td>
            <td><button className="link-button" onClick={() => patch(`/admin/promos/${promotion.id}`, { active: !promotion.active })}>{promotion.active ? "Deactivate" : "Activate"}</button></td>
          </tr>)}</tbody>
        </table>
      </section>
      <section className="panel">
        <span className="eyebrow">Payment settings</span>
        <h2>Mobile Money destinations</h2>
        <p>Account numbers are deliberately hidden here. Operators change them in the protected deployment environment; no source-code change is required.</p>
        <table><thead><tr><th>Provider</th><th>Environment variable</th><th>Status</th></tr></thead>
          <tbody>{paymentSettings?.mobileMoney.map((setting) => (
            <tr key={setting.method}>
              <td>{setting.method === "ORANGE_MONEY" ? "Orange Money" : "MTN MoMo"}</td>
              <td><code>{setting.environmentVariable}</code></td>
              <td>{setting.configured ? "Configured" : "Not configured"}</td>
            </tr>
          ))}</tbody>
        </table>
        {paymentSettings?.restartRequired && <p className="notice">Restart or redeploy the API after changing an environment value.</p>}
      </section>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
