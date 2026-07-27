import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiClient, money } from "@libswiftride/sdk";
import { Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

type Employee = { id: string; active: boolean; monthlyLimitMinor: number; user: { firstName: string; lastName: string; email: string | null; status: string } };
type Account = { id: string; name: string; billingEmail: string; monthlyBudgetMinor: number; employees: Employee[]; currentMonth: { rides: number; spendMinor: number; remainingBudgetMinor: number } };

function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [userId, setUserId] = useState("");
  const [monthlyLimitMinor, setMonthlyLimitMinor] = useState(50_000);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    const response = await apiClient.request<{ data: Account }>("/corporate/account");
    setAccount(response.data);
    setLoading(false);
  }
  useEffect(() => { load().catch((error: Error) => { setMessage(error.message); setLoading(false); }); }, []);
  async function addEmployee() {
    if (!account) return;
    try {
      await apiClient.request("/corporate/employees", { method: "POST", body: JSON.stringify({ accountId: account.id, userId, monthlyLimitMinor }) });
      setUserId(""); await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  async function toggleEmployee(employee: Employee) {
    try {
      await apiClient.request(`/corporate/employees/${employee.id}`, { method: "PATCH", body: JSON.stringify({ active: !employee.active }) });
      await load();
    } catch (error) { setMessage((error as Error).message); }
  }
  return <Shell product="Business" demoRole="BUSINESS_MANAGER">
    <span className="eyebrow">Corporate travel</span><h1>{account?.name ?? "Business account"}</h1>
    {loading && <p className="notice" role="status">Loading business account…</p>}
    {message && <p className="notice error">{message}</p>}
    <div className="grid">
      <Stat label="Monthly spend" value={money(account?.currentMonth.spendMinor ?? 0)} detail={`${account?.currentMonth.rides ?? 0} employee rides`} />
      <Stat label="Remaining budget" value={money(account?.currentMonth.remainingBudgetMinor ?? 0)} detail={`of ${money(account?.monthlyBudgetMinor ?? 0)}`} />
      <Stat label="Active employees" value={String(account?.employees.filter((employee) => employee.active).length ?? 0)} />
    </div>
    <section className="panel"><h2>Add employee</h2>
      <div className="form-row"><label>Passenger user ID<input value={userId} onChange={(event) => setUserId(event.target.value)} /></label><label>Monthly limit (minor units)<input type="number" min="1" value={monthlyLimitMinor} onChange={(event) => setMonthlyLimitMinor(Number(event.target.value))} /></label></div>
      <button className="action" onClick={addEmployee} disabled={!userId}>Add employee</button>
    </section>
    <section className="panel" aria-busy={loading}><h2>Employee ride policy</h2>
      <table><thead><tr><th>Employee</th><th>Email</th><th>Monthly limit</th><th>Status</th><th>Action</th></tr></thead><tbody>{account?.employees.map((employee) => <tr key={employee.id}><td>{employee.user.firstName} {employee.user.lastName}</td><td>{employee.user.email ?? "—"}</td><td>{money(employee.monthlyLimitMinor)}</td><td>{employee.active ? "Active" : "Disabled"}</td><td><button className="link-button" onClick={() => toggleEmployee(employee)}>{employee.active ? "Disable" : "Enable"}</button></td></tr>)}</tbody></table>
      {!loading && !account?.employees.length && <p>No employees have been added.</p>}
    </section>
  </Shell>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
