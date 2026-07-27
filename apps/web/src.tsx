import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Action, Map, Shell, Stat } from "@libswiftride/ui";
import "@libswiftride/ui/styles.css";

const faqs = [
  ["How is my fare calculated?", "Your estimate includes the base fare, distance and time. Any promotion is shown before you book. The final fare is calculated securely by LibSwiftRide."],
  ["Which payment methods are supported?", "Cash, MTN Mobile Money and Orange Money are available in the Liberia experience. This local demonstration keeps all live payment APIs disabled."],
  ["How does LibSwiftRide keep trips safe?", "Every trip supports driver verification, ride PINs, live sharing, emergency contacts and a direct SOS escalation to our operations team."],
  ["Can businesses and fleets join?", "Yes. Dedicated portals give companies employee travel controls and fleet owners driver, vehicle, earnings and compliance tools."],
];

function App() {
  const [pickup, setPickup] = useState("ELWA Junction, Paynesville");
  const [destination, setDestination] = useState("Broad Street, Monrovia");
  const [vehicle, setVehicle] = useState("Comfort");
  const [payment, setPayment] = useState("Cash");
  const [estimated, setEstimated] = useState(false);
  const fare = useMemo(() => vehicle === "Comfort" ? 950 : vehicle === "XL" ? 1_280 : 720, [vehicle]);

  return <Shell product="Home">
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">Liberia's local mobility platform</span>
        <h1>Monrovia moves better with us.</h1>
        <p>Safe, dependable rides for every journey—from the morning commute to business travel, airport pickups and deliveries.</p>
        <div className="hero-actions"><a href="http://localhost:3001"><Action>Book your first ride</Action></a><a href="#drive"><Action className="secondary">Drive with LibSwiftRide</Action></a></div>
        <div className="grid" style={{ marginTop: 30 }}>
          <Stat label="Safety support" value="24/7" detail="Local operations team" />
          <Stat label="Driver earnings" value="88%" detail="Transparent allocation" />
          <Stat label="Service area" value="Monrovia" detail="Expanding across Liberia" />
        </div>
      </div>
      <div className="panel booking-card">
        <span className="eyebrow">Get a fare estimate</span><h2>Where can we take you?</h2>
        <div className="form">
          <label>Pickup location<input value={pickup} onChange={(event) => setPickup(event.target.value)} /></label>
          <label>Destination<input value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
          <div className="form-row"><label>Vehicle<select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option>Economy</option><option>Comfort</option><option>XL</option></select></label><label>Pay with<select value={payment} onChange={(event) => setPayment(event.target.value)}><option>Cash</option><option>MTN MoMo</option><option>Orange Money</option></select></label></div>
          {estimated && <div className="notice"><div className="toolbar"><span>Estimated fare</span><strong>LRD {fare.toLocaleString()}</strong></div><small>{pickup} → {destination} · 22–28 min · {vehicle}</small></div>}
          <Action onClick={() => setEstimated(true)}>See estimated fare</Action>
          <small>Live payments are disabled in this demo. No charge will be made.</small>
        </div>
      </div>
    </section>

    <section className="panel" style={{ padding: 0 }}><Map label="LibSwiftRide Monrovia coverage map" /></section>

    <section id="safety" style={{ padding: "70px 0 30px" }}>
      <span className="eyebrow">Safety at every turn</span><h2>People first. Every ride.</h2>
      <div className="feature-grid">
        {[["✓","Verified drivers","Identity, licence, vehicle and insurance checks before a driver goes online."],["PIN","Ride PIN protection","Confirm the right passenger and driver before every trip begins."],["SOS","Always-on assistance","Share your trip or connect with the local safety desk whenever you need help."]].map(([icon,title,body])=><article className="feature-card" key={title}><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </section>

    <section id="drive" className="split" style={{ padding: "70px 0" }}>
      <div className="panel soft"><span className="eyebrow">Earn on your schedule</span><h2>Drive Liberia forward.</h2><p>Keep 88% of every fare, see earnings clearly and get tools for availability, safety, performance and payouts.</p><a href="http://localhost:3002"><Action>Explore the driver app</Action></a></div>
      <div className="panel"><span className="eyebrow">Built for fleet partners</span><h2>Grow a healthier fleet.</h2><p>See utilisation, compliance, maintenance, driver performance and earnings from one operational workspace.</p><a href="http://localhost:3003"><Action className="secondary">Open fleet portal</Action></a></div>
    </section>

    <section id="business" className="panel">
      <div className="split"><div><span className="eyebrow">LibSwiftRide for Business</span><h2>Work travel, under control.</h2><p>Set employee limits, manage monthly budgets, review every trip and give teams a safer way to move around Monrovia.</p><a href="http://localhost:3006"><Action>Explore business travel</Action></a></div><div className="chart" aria-label="Illustrative monthly business travel chart">{[48,72,58,90,77,100].map((height,index)=><span key={index} style={{height:`${height}%`}} data-label={["Feb","Mar","Apr","May","Jun","Jul"][index]} />)}</div></div>
    </section>

    <section style={{ padding: "70px 0 35px" }}><span className="eyebrow">Trusted across Monrovia</span><h2>Made for the way Liberia moves.</h2><div className="feature-grid">
      {[["“The fare was clear before I booked, and trip sharing gave my family peace of mind.”","Martha · Sinkor"],["“I can see my earnings and schedule in one place. It feels built for drivers.”","Samuel · Paynesville"],["“Employee travel is finally easier to approve and track.”","Hawa · Business manager"]].map(([quote,name])=><blockquote className="feature-card" key={name}><p>{quote}</p><strong>{name}</strong></blockquote>)}
    </div></section>

    <section className="panel soft"><div className="split"><div><span className="eyebrow">The app that keeps up</span><h2>Your city, in your pocket.</h2><p>Book, track, pay, share and rate from a passenger experience designed to work beautifully on any screen.</p><a href="http://localhost:3001"><Action>Open passenger demo</Action></a></div><div className="panel"><div className="mini-row"><span>Driver arriving</span><strong>3 min</strong></div><div className="mini-row"><span>Toyota Corolla · DEMO-001</span><span>4.9 ★</span></div><div className="mini-row"><span>Ride PIN</span><strong>4821</strong></div><div className="progress"><span style={{width:"68%"}} /></div></div></div></section>

    <section id="faq" style={{ padding: "70px 0 20px" }}><span className="eyebrow">Questions, answered</span><h2>Frequently asked questions</h2><div className="split">{faqs.map(([question,answer])=><details className="panel" key={question}><summary><strong>{question}</strong></summary><p>{answer}</p></details>)}</div></section>

    <section id="contact" className="panel"><div className="split"><div><span className="eyebrow">We are here to help</span><h2>Talk to the LibSwiftRide team.</h2><p>Visit the local operations experience, ask about partnerships or learn how we are building safer mobility for Liberia.</p></div><div className="stack"><div className="mini-row"><span>Passenger support</span><strong>24/7 in-app</strong></div><div className="mini-row"><span>Fleet partnerships</span><strong>Monrovia</strong></div><div className="mini-row"><span>Business travel</span><strong>Custom plans</strong></div></div></div></section>
  </Shell>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
