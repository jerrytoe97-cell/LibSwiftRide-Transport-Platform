import React, { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeToggle } from "@libswiftride/ui";
import "@libswiftride/ui/theme.css";
import "./styles.css";

type Route = { path: string; label: string };
const routes: Route[] = [
  { path: "/", label: "Home" },
  { path: "/services", label: "Services" },
  { path: "/safety", label: "Safety" },
  { path: "/business", label: "Business" },
  { path: "/drive", label: "Drive" },
  { path: "/about", label: "About" },
  { path: "/leadership", label: "Leadership" },
];

const allRoutes = new Set([
  "/", "/about", "/services", "/safety", "/business", "/drive", "/leadership",
  "/leadership/jerry-toe", "/leadership/matthew-gaye",
  "/leadership/jerry-g-toe", "/leadership/matthew-p-gaye-jr", "/contact", "/faq",
  "/privacy", "/terms", "/driver-terms", "/investors",
]);

const publicEnvironment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const passengerAppUrl = publicEnvironment?.VITE_PASSENGER_APP_URL || "/contact?intent=book";
const driverAppUrl = publicEnvironment?.VITE_DRIVER_APP_URL || "/contact?intent=driver";
const businessAppUrl = publicEnvironment?.VITE_BUSINESS_APP_URL || "/contact?intent=business";
const companyPhone = publicEnvironment?.VITE_COMPANY_PHONE?.trim() || "0779614995";

const services = [
  ["01", "Everyday passenger rides", "Book dependable everyday travel with upfront fare guidance, driver details and live trip updates."],
  ["02", "Airport transfers", "Schedule reliable pickups and drop-offs for Roberts International Airport and local air travel."],
  ["03", "Corporate transportation", "Give employees controlled business travel with reporting, budgets and monthly billing."],
  ["04", "Fleet solutions", "Operate drivers, vehicles, compliance and earnings from one connected mobility platform."],
  ["05", "Scheduled rides", "Reserve important journeys ahead of time and receive clear status notifications."],
  ["06", "Delivery and logistics", "Move parcels and business items with traceable pickup, delivery and proof workflows."],
];

const safetyFeatures = [
  ["Verified", "Driver verification", "Identity, licence and onboarding checks are reviewed before drivers can serve passengers."],
  ["Live", "Trip monitoring", "GPS-backed status updates help passengers and operations teams follow active journeys."],
  ["24/7", "Emergency support", "SOS escalation, trip sharing and emergency contacts are built into the ride experience."],
  ["Checked", "Vehicle inspection", "Registration, insurance, inspection and expiry controls support roadworthy vehicles."],
  ["Secure", "Account protection", "Strong authentication, protected sessions and role-based access safeguard platform accounts."],
  ["Rated", "Ratings and feedback", "Two-way ratings and moderation help reinforce respectful, dependable service."],
];

const faqs = [
  ["How do I book a ride?", "Open the LibSwiftRide passenger app, enter your pickup and destination, review your fare estimate and choose your ride and payment option."],
  ["How is pricing calculated?", "Fares are calculated from the base fare, estimated distance and time. Any waiting fees, tolls, dynamic pricing or discounts are shown in the fare breakdown."],
  ["Which payment methods can I use?", "LibSwiftRide is designed to support cash, Orange Money, MTN Mobile Money, wallet payments and cards as each certified provider becomes available."],
  ["How do I apply to drive?", "Start on the Drive page, submit your profile and required documents, add an eligible vehicle and complete the verification process."],
  ["What safety features are available?", "Driver and vehicle verification, live trip monitoring, ride PINs, emergency contacts, SOS escalation, trip sharing and two-way ratings support safer journeys."],
  ["Where does LibSwiftRide operate?", "The platform is launching around Greater Monrovia with an operating model designed to expand responsibly across Liberia."],
  ["Can my organisation open a business account?", "Yes. Business accounts support employee access, ride limits, approval rules, monthly budgets, trip reporting and consolidated billing."],
  ["How do I contact customer support?", "Use in-app support for an active trip or visit the Contact page for passenger, driver, business and partnership enquiries."],
];

const leaders = [
  {
    slug: "jerry-toe", initials: "JT", name: "Jerry G. Toe", role: "Founder & Chief Executive Officer",
    summary: "Jerry leads LibSwiftRide’s vision to build safer, locally relevant and technology-powered mobility for Liberia.",
    bio: "As founder and chief executive officer, Jerry G. Toe guides LibSwiftRide’s strategy, platform mission and long-term partnerships. His focus is building trusted transportation infrastructure that creates opportunity for drivers, improves passenger access and gives Liberian businesses dependable mobility tools.",
    photo: "/images/leadership/jerry-g-toe-ceo.jpg" as string | undefined,
  },
  {
    slug: "matthew-gaye", initials: "MG", name: "Matthew P. Gaye Jr.", role: "Chief Operating Officer",
    summary: "Matthew directs operational readiness, driver quality and the day-to-day systems that turn the platform promise into reliable service.",
    bio: "As chief operating officer, Matthew P. Gaye Jr. leads service operations, safety coordination and scalable execution. He works across driver onboarding, fleet performance and customer support to ensure LibSwiftRide grows with operational discipline and a strong local service culture.",
    photo: "/images/leadership/matthew-p-gaye-jr-coo.jpg" as string | undefined,
  },
];

function Link({ href, children, className = "", onClick, ariaCurrent }: { href: string; children: ReactNode; className?: string; onClick?: () => void; ariaCurrent?: "page" | undefined }) {
  return <a href={href} className={className} onClick={(event) => {
    if (href.startsWith("/")) {
      event.preventDefault();
      window.history.pushState({}, "", href);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    onClick?.();
  }} aria-current={ariaCurrent}>{children}</a>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  return <header className="site-header">
    <div className="nav-wrap">
      <Link href="/" className="logo" onClick={() => setOpen(false)}><img className="brand-logo-image" src="/brand/libswiftride-logo.png" alt="LibSwiftRide official logo" /><span>LibSwift<span>Ride</span></span></Link>
      <button className="menu-toggle" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(!open)}><span /><span /><span /><b>Menu</b></button>
      <nav id="primary-nav" className={open ? "primary-nav open" : "primary-nav"} aria-label="Main navigation">
        {routes.map((route) => {
          const isActive = currentPath === route.path || (route.path === "/leadership" && currentPath.startsWith("/leadership/"));
          return <Link key={route.path} href={route.path} className={isActive ? "active" : ""} ariaCurrent={isActive ? "page" : undefined} onClick={() => setOpen(false)}>{route.label}</Link>;
        })}
        <Link href="/contact" className={currentPath === "/contact" ? "active" : ""} ariaCurrent={currentPath === "/contact" ? "page" : undefined} onClick={() => setOpen(false)}>Contact</Link>
        <div className="mobile-nav-actions"><Link className="button" href={passengerAppUrl} onClick={() => setOpen(false)}>Book a Ride</Link><Link className="button secondary" href={driverAppUrl} onClick={() => setOpen(false)}>Driver portal</Link></div>
      </nav>
      <ThemeToggle />
      <div className="nav-actions"><Link className="text-link" href={driverAppUrl}>Driver login</Link><Link className="button small" href={passengerAppUrl}>Book a Ride</Link></div>
    </div>
  </header>;
}

function Footer() {
  const columns = [
    ["Company", [["About","/about"],["Leadership","/leadership"],["Investors & partners","/investors"],["Careers","/contact?intent=careers"],["Contact","/contact"]]],
    ["Services", [["Passenger rides","/services"],["Airport transfers","/services"],["Business","/business"],["Delivery","/services"]]],
    ["Support", [["Safety","/safety"],["FAQ","/faq"],["Help centre","/contact?intent=support"]]],
    ["Legal", [["Privacy Policy","/privacy"],["Terms of Service","/terms"],["Driver Terms","/driver-terms"],["Contact","/contact"]]],
  ] as const;
  return <footer className="site-footer"><div className="footer-main">
    <div className="footer-brand"><Link href="/" className="logo light"><img className="brand-logo-image" src="/brand/libswiftride-logo.png" alt="LibSwiftRide official logo" loading="lazy" /><span>LibSwift<span>Ride</span></span></Link><p>Technology-powered transportation built around Liberia&apos;s people, communities and businesses.</p><div className="footer-company-details"><span>Headquartered in Monrovia, Liberia</span><span>Serving Greater Monrovia at launch</span><a href={`tel:${companyPhone}`}>{companyPhone}</a><Link href="/contact">Contact our mobility team</Link></div><div className="socials" aria-label="LibSwiftRide social media links"><a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook">f</a><a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn">in</a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram">ig</a><a href="https://x.com/" target="_blank" rel="noreferrer" aria-label="X">x</a></div></div>
    {columns.map(([title,links]) => <div className="footer-column" key={title}><h3>{title}</h3>{links.map(([label,href]) => <Link href={href} key={label}>{label}</Link>)}</div>)}
  </div><div className="footer-bottom"><span>© 2026 LibSwiftRide. All rights reserved.</span><span>Safe rides. Anytime. Anywhere. · Liberia</span></div></footer>;
}

function Layout({ children }: { children: ReactNode }) {
  return <><a className="skip-link" href="#main-content">Skip to main content</a><Header /><main id="main-content" tabIndex={-1}>{children}</main><Footer /></>;
}

function Eyebrow({ children }: { children: ReactNode }) { return <span className="eyebrow">{children}</span>; }
function ArrowLink({ href, children }: { href: string; children: ReactNode }) { return <Link href={href} className="arrow-link">{children}<span aria-hidden="true">→</span></Link>; }

function PageHero({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-hero"><div className="container narrow"><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1><p>{description}</p>{action && <div className="hero-buttons">{action}</div>}</div></section>;
}

function MobilityVisual() {
  const trackingUpdates = [
    { eta: "4 min", status: "Driver confirmed", location: "Approaching pickup" },
    { eta: "3 min", status: "Driver en route", location: "Live route updated" },
    { eta: "2 min", status: "Driver nearby", location: "Arriving shortly" },
  ];
  const [trackingStep, setTrackingStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTrackingStep((step) => (step + 1) % trackingUpdates.length), 3200);
    return () => window.clearInterval(timer);
  }, []);
  const update = trackingUpdates[trackingStep]!;
  return <div className="mobility-visual mobility-photo">
    <img src="/images/libswiftride-monrovia-hero.png" alt="A LibSwiftRide driver welcoming a passenger beside a vehicle in Monrovia" />
    <div className="tracking-route" aria-hidden="true"><i /><i /><i /><span /><div className={`tracking-car tracking-car-${trackingStep}`}>LS</div></div>
    <div className="ride-card live-ride-card" aria-live="polite"><div className="car-icon">LS</div><div><strong>{update.status}</strong><small>{update.location} · Monrovia</small></div><b>{update.eta}</b></div>
    <div className="visual-label"><span className="pulse" /> Simulated GPS preview</div>
    <div className="gps-demo-label"><span>Demonstration Route</span><small>Simulated journey · No passenger or personal location data</small></div>
  </div>;
}

function Home() {
  return <Layout>
    <section className="home-hero"><div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="container hero-grid"><div className="hero-copy"><div className="launch-pill"><span className="pulse" /> Serving Greater Monrovia at launch</div><Eyebrow>Safe rides. Local knowledge. Digital convenience.</Eyebrow><h1>Liberia&apos;s Trusted Digital Transportation Platform</h1><p>Connecting passengers, drivers, and businesses through safe, reliable, and technology-powered mobility.</p><div className="hero-buttons hero-actions"><Link className="button hero-primary" href={passengerAppUrl}>Book a Ride</Link><Link className="button secondary hero-secondary" href="/drive">Drive &amp; Earn</Link><Link className="business-text-cta" href="/business">For business <span aria-hidden="true">→</span></Link></div><p className="hero-assurance">Everyday rides · Airport transfers · Scheduled journeys · Business mobility</p><div className="trust-row">{[["Verified","Driver & vehicle checks"],["Clear","Upfront fare guidance"],["Local","Monrovia-based support"],["Protected","Live trip safeguards"]].map(([icon,label])=><div key={label}><span>{icon}</span><strong>{label}</strong></div>)}</div></div><MobilityVisual /></div></section>
    <HowItWorks />
    <FinalTrust />
    <LaunchVision />
    <BookingPreview />
    <TrustFeatures />
    <section className="section"><div className="container"><div className="section-heading"><div><Eyebrow>One platform, many journeys</Eyebrow><h2>Mobility services built for real life.</h2></div><p>From one passenger trip to an entire company or fleet, LibSwiftRide brings planning, safety and visibility into one connected experience.</p></div><div className="service-grid">{services.map(([number,title,body])=><article className="service-card" key={title}><span>{number}</span><h3>{title}</h3><p>{body}</p><ArrowLink href="/services">Explore service</ArrowLink></article>)}</div></div></section>
    <SafetyPreview />
    <LiberiaSection />
    <LeadershipPreview />
    <BusinessPreview />
    <DriverPreview />
    <AppDownload />
    <Testimonials />
    <FaqPreview />
    <section className="final-cta"><div className="container"><Eyebrow>Ready when you are</Eyebrow><h2>Ready to Move with LibSwiftRide?</h2><p>Book your next journey, build a flexible driving business or give your organisation a smarter way to travel.</p><div className="hero-buttons center final-actions"><Link className="button light-button" href={passengerAppUrl}>Book a Ride</Link><Link className="button outline-light" href="/drive">Become a Driver</Link><Link className="button outline-light" href="/business">Business Solutions</Link></div></div></section>
  </Layout>;
}

function BookingPreview() {
  const [message, setMessage] = useState("");
  const locationSuggestions = [
    "Broad Street, Monrovia",
    "Central Monrovia",
    "Ducor Hill",
    "Mamba Point",
    "Sinkor",
    "Airfield",
    "Old Road",
    "Congo Town",
    "Paynesville",
    "Red Light",
    "ELWA Junction",
    "SKD Sports Complex",
    "Barnersville",
    "Gardnersville",
    "New Georgia",
    "Logan Town",
    "Clara Town",
    "Bushrod Island",
    "Duala",
    "Freeport of Monrovia",
    "Virginia",
    "Hotel Africa",
    "Brewerville",
    "Kendeja",
    "Thinkers Village",
    "Marshall",
    "Roberts International Airport",
    "Spriggs Payne Airport",
    "University of Liberia — Capitol Hill",
    "University of Liberia — Fendall",
  ];
  return <section className="booking-preview-section" aria-labelledby="booking-preview-title"><div className="container"><form className="booking-preview" onSubmit={(event) => { event.preventDefault(); setMessage("Demo estimate ready. Open the passenger app to confirm live availability and pricing."); }}>
    <div className="booking-intro"><Eyebrow>Plan your journey</Eyebrow><h2 id="booking-preview-title">Where can we take you?</h2><p>Preview a journey across Greater Monrovia. No booking is submitted from this demonstration.</p></div>
    <label><span>Pickup location</span><input list="pickup-location-suggestions" name="pickup" defaultValue="Broad Street, Monrovia" placeholder="Enter an address or landmark" autoComplete="street-address" required /><datalist id="pickup-location-suggestions">{locationSuggestions.map((location)=><option value={location} key={`pickup-${location}`} />)}</datalist></label>
    <label><span>Destination</span><input list="destination-location-suggestions" name="destination" defaultValue="Sinkor" placeholder="Enter any destination" autoComplete="off" required /><datalist id="destination-location-suggestions">{locationSuggestions.map((location)=><option value={location} key={`destination-${location}`} />)}</datalist></label>
    <label><span>Ride type</span><select><option>Swift Standard</option><option>Swift Comfort</option><option>Airport Transfer</option></select></label>
    <label><span>Schedule</span><select><option>Ride now</option><option>Schedule for later</option></select></label>
    <button className="button booking-submit" type="submit">Get Fare Estimate</button>
    <p className="booking-message" aria-live="polite">{message}</p>
  </form></div></section>;
}

function TrustFeatures() {
  const reasons = [
    ["01", "Driver verification", "Identity, licence, vehicle and onboarding checks support accountable service across Greater Monrovia."],
    ["02", "Passenger safety", "Ride PINs, trip sharing and clear driver details help passengers travel with greater confidence."],
    ["03", "Emergency support", "Safety escalation and incident workflows connect riders and drivers with Liberia-based support."],
    ["04", "Transparent pricing", "Fare guidance and trip details are presented clearly before a passenger confirms a journey."],
    ["05", "Secure payments", "Protected payment workflows are being prepared; live payment providers remain disabled in this demonstration."],
  ];
  return <section className="why-band" aria-labelledby="trust-title"><div className="container"><div className="why-intro"><div><Eyebrow>Trust, built into every trip</Eyebrow><h2 id="trust-title">More confidence from pickup to destination.</h2></div><p>LibSwiftRide brings identity, trip and support information together so passengers and drivers can make informed decisions at every stage.</p></div><div className="why-grid">{reasons.map(([number,title,body])=><article key={title}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div><div className="trust-footer"><span>Designed in Liberia</span><span>Driver-first earning model</span><span>86% of every completed fare goes to the driver</span></div></div></section>;
}

function AppDownload() {
  return <section className="section app-section"><div className="container app-shell"><div className="app-copy"><Eyebrow>LibSwiftRide in your hand</Eyebrow><h2>One platform. Two focused experiences.</h2><p>Passengers can book and follow journeys while drivers manage trips, availability and earnings through tools designed for Liberia.</p><div className="app-feature-columns"><div><strong>Passenger app</strong>{["Book rides","Track drivers","View fares","Manage payments","Access ride history"].map((item)=><span key={item}>✓ {item}</span>)}</div><div><strong>Driver app</strong>{["Accept trips","View earnings","Manage availability","Access navigation","Receive support"].map((item)=><span key={item}>✓ {item}</span>)}</div></div><div className="app-actions"><Link className="store-button" href={passengerAppUrl}><span>Passenger portal</span><strong>Open ride experience</strong></Link><Link className="store-button" href={driverAppUrl}><span>Driver portal</span><strong>Open driver experience</strong></Link></div><small>Interactive web previews are available. Native app availability will be announced before public launch.</small></div><div className="phone-stage" aria-label="Preview of the LibSwiftRide passenger application"><div className="phone"><div className="phone-top" /><div className="phone-screen"><div className="mini-brand"><img src="/brand/libswiftride-logo.png" alt="LibSwiftRide logo" /><strong>LibSwiftRide</strong></div><span className="mini-greeting">Good morning</span><h3>Where are you going?</h3><div className="mini-field"><i />Current location</div><div className="mini-field destination"><i />Choose destination</div><div className="mini-map"><span /><b>Driver nearby · 3 min</b></div></div></div><div className="app-float-card"><span>Trip protection</span><strong>Live tracking active</strong></div></div></div></section>;
}

function HowItWorks() {
  const passenger = [["1","Enter pickup and destination","Tell us where you are and where you need to go."],["2","Choose your ride","Compare the available ride, fare and payment choices."],["3","Track your driver","Follow the verified driver and vehicle as they approach."],["4","Arrive safely","Stay connected through the journey and complete your rating."]];
  const driver = [["1","Register","Create your driver profile and add your vehicle."],["2","Get verified","Complete identity, licence, vehicle and safety checks."],["3","Accept trips","Review clear trip information and choose suitable requests."],["4","Earn income","Drive on your schedule and keep 86% of every completed fare."]];
  const business = [["1","Create an account","Set up your organisation and authorised transport team."],["2","Invite employees","Give approved travellers access to company-sponsored rides."],["3","Set controls","Manage departments, budgets, ride rules and approval limits."],["4","Review activity","Track trips, monthly billing and mobility reports in one place."]];
  const flows = [
    { className: "passenger-flow", label: "For passengers", title: "Ride with confidence", steps: passenger, href: passengerAppUrl, cta: "Book your first ride" },
    { className: "driver-flow", label: "For drivers", title: "Drive and earn", steps: driver, href: "/drive", cta: "Become a driver" },
    { className: "business-flow", label: "For businesses", title: "Manage company mobility", steps: business, href: "/business", cta: "Explore business solutions" },
  ];
  return <section className="section dark-section how-section" aria-labelledby="how-title"><div className="container"><div className="section-heading light-heading"><div><Eyebrow>How LibSwiftRide works</Eyebrow><h2 id="how-title">One platform. Three ways to move.</h2></div><p>Passengers, drivers and organisations each get a clear experience designed around their journey.</p></div><div className="triple-flow">{flows.map((flow)=><div className={`flow-card ${flow.className}`} key={flow.label}><div className="flow-card-heading"><span>{flow.label}</span><h3>{flow.title}</h3></div>{flow.steps.map(([number,title,body])=><article className="step" key={title}><b>{number}</b><div><h4>{title}</h4><p>{body}</p></div></article>)}<Link className="button flow-cta" href={flow.href}>{flow.cta}</Link></div>)}</div></div></section>;
}

function SafetyPreview() {
  return <section className="section"><div className="container safety-grid"><div><Eyebrow>Safety is the standard</Eyebrow><h2>Protection designed into every journey.</h2><p className="lead">From driver approval to the final rating, our platform gives passengers, drivers and operations teams the information and tools to act with confidence.</p><ArrowLink href="/safety">Learn About Safety</ArrowLink></div><div className="safety-list">{safetyFeatures.map(([tag,title,body])=><article key={title}><span>{tag}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></div></section>;
}

function LiberiaSection() {
  return <section className="section liberia-section"><div className="container split-feature"><div className="liberia-art"><div className="flag-stripe" /><span>LR</span><strong>Built here.<br />Built for here.</strong></div><div><Eyebrow>Designed around Liberia</Eyebrow><h2>Built for Liberia&apos;s roads, communities, and businesses.</h2><p className="lead">LibSwiftRide is designed around how Liberian communities, drivers and businesses actually move—from road and transport realities to payment preferences and responsive local support.</p><div className="service-areas" aria-label="Featured Liberia service areas">{["Monrovia","Paynesville","Sinkor","ELWA","Red Light","Congo Town","Airport transfers"].map((item)=><span key={item}>{item}</span>)}</div><div className="liberia-needs">{["Communities","Road realities","Businesses","Drivers","Payment needs","Local support"].map((item)=><span key={item}>{item}</span>)}</div><Link className="button secondary" href="/about">Why LibSwiftRide</Link></div></div></section>;
}

function Portrait({ leader, large = false }: { leader: typeof leaders[number]; large?: boolean }) {
  const [missing, setMissing] = useState(false);
  return <div className={`portrait ${large ? "large" : ""}`}>{leader.photo && !missing ? <img src={leader.photo} alt={`${leader.name}, ${leader.role}`} onError={() => setMissing(true)} /> : <span aria-label={`Portrait placeholder for ${leader.name}`}>{leader.initials}</span>}<div className="portrait-accent" /></div>;
}

function LeadershipPreview() {
  return <section className="section leadership-section"><div className="container"><div className="section-heading"><div><Eyebrow>Leadership</Eyebrow><h2>Building with purpose and discipline.</h2></div><p>LibSwiftRide’s leadership is focused on trusted execution, local opportunity and mobility infrastructure that can grow with Liberia.</p></div><div className="leader-grid">{leaders.map((leader)=><article className="leader-card" key={leader.slug}><Portrait leader={leader} /><div><span>{leader.role}</span><h3>{leader.name}</h3><p>{leader.summary}</p><ArrowLink href={`/leadership/${leader.slug}`}>View full profile</ArrowLink></div></article>)}</div><div className="leadership-values" aria-label="LibSwiftRide company values">{[["Local insight","Build around the realities of Liberia."],["Trusted execution","Turn every promise into accountable service."],["Shared progress","Create lasting value for riders, drivers and communities."]].map(([title,body])=><div key={title}><strong>{title}</strong><span>{body}</span></div>)}</div></div></section>;
}

function BusinessPreview() {
  return <section className="section business-band"><div className="container business-grid"><div><Eyebrow>LibSwiftRide for Business</Eyebrow><h2>Company travel without the operational guesswork.</h2><p>Manage employee transportation, airport and executive travel, monthly billing, trip reporting, department controls and fleet visibility in one workspace.</p><div className="business-benefits">{["Employee transportation","Airport & executive travel","Monthly billing","Trip reporting","Department controls","Fleet visibility"].map((item)=><span key={item}>✓ {item}</span>)}</div><Link href={businessAppUrl} className="button">Create a Business Account</Link></div><div className="business-dashboard"><div className="dash-top"><span>July mobility</span><strong>LRD 284,600</strong></div><div className="bars">{[42,65,54,78,68,92].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div><div className="dash-stats"><span><small>Employees</small><strong>20</strong></span><span><small>On-policy</small><strong>96%</strong></span><span><small>Trips</small><strong>48</strong></span></div></div></div></section>;
}

function DriverPreview() {
  return <section className="section"><div className="container driver-grid"><div className="driver-visual"><div className="earnings-card"><small>This week</small><strong>LRD 18,920</strong><span>86% of completed fares</span></div><div className="online-card"><i /> You’re online</div></div><div><Eyebrow>Drive with LibSwiftRide</Eyebrow><h2>Earn flexibly. Drive with clarity.</h2><div className="benefit-list">{["Flexible earning opportunities","Transparent trip information","Responsive driver support","Built-in safety tools","A clear application process"].map((item)=><div key={item}><span>✓</span>{item}</div>)}</div><Link href="/drive" className="button">Become a Driver</Link></div></div></section>;
}

function Testimonials() {
  return <section className="section testimonials-section"><div className="container"><div className="section-heading"><div><Eyebrow>Sample customer experiences for demonstration</Eyebrow><h2>What better mobility can feel like.</h2></div><p className="sample-note">Demonstration content only. These are fictional examples and are not verified customer testimonials.</p></div><div className="testimonial-grid">{[
    ["“The fare information was clear, and I could share the trip with my family before we moved.”","Sample passenger","Sinkor"],
    ["“I could see the destination and earnings before accepting. That clarity makes a real difference.”","Sample driver","Paynesville"],
    ["“One monthly view for employee trips would save our team hours of administrative work.”","Sample business manager","Monrovia"],
  ].map(([quote,name,location])=><blockquote key={name}><span>“</span><p>{quote}</p><footer><strong>{name}</strong><small>{location} · Demo profile</small></footer></blockquote>)}</div></div></section>;
}

function FaqPreview({ full = false }: { full?: boolean }) {
  const items = full ? faqs : faqs.slice(0,6);
  return <section className="section"><div className="container faq-grid"><div><Eyebrow>Help centre</Eyebrow><h2>Questions, answered clearly.</h2><p>Find practical information about rides, driving, safety, payments and business accounts.</p>{!full && <ArrowLink href="/faq">View all frequently asked questions</ArrowLink>}</div><div className="accordion">{items.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></div></section>;
}

function FinalTrust() {
  const items = [
    ["01", "Safety at Every Step", "Live trip visibility, emergency tools and operational support are designed into the journey."],
    ["02", "Verified Drivers", "Identity, licence, document and vehicle checks support accountable transportation."],
    ["03", "Liberia Knowledge", "Local routes, communities, road realities and payment needs shape how the platform works."],
    ["04", "Digital Convenience", "Book, track, pay and review trip information through one connected experience."],
    ["05", "Business Mobility", "Employee travel, controls, reporting and billing tools help organisations move with clarity."],
  ];
  return <section className="section final-trust-section" aria-labelledby="final-trust-title"><div className="container"><div className="section-heading"><div><Eyebrow>Built for trust. Designed for Liberia.</Eyebrow><h2 id="final-trust-title">Why Choose LibSwiftRide?</h2></div><p>Local understanding, visible safeguards and connected digital tools create a better mobility experience for passengers, drivers and businesses.</p></div><div className="final-trust-grid">{items.map(([icon,title,body])=><article key={title}><span>{icon}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>;
}

function LaunchVision() {
  const launchGoals = [
    ["10,000+", "Future riders", "People we aim to make mobility more accessible for."],
    ["5,000+", "Driver opportunities", "Potential earning pathways as the platform expands."],
    ["15+", "Service areas", "Communities targeted through responsible phased growth."],
    ["24/7", "Digital support", "The service-availability standard we are building toward."],
  ];
  const impactPoints = [
    ["Local employment creation", "Create technology, operations, customer-support and driving opportunities for Liberians."],
    ["Digital transformation", "Bring booking, dispatch, trip visibility and business mobility into one connected local platform."],
    ["Safer transportation", "Combine driver verification, vehicle standards and live trip safeguards with accountable operations."],
    ["Economic opportunity", "Help independent drivers and fleet partners access transparent trips, earnings information and support."],
  ];
  return <section className="section launch-vision-section" aria-labelledby="launch-vision-title"><div className="container">
    <div className="launch-vision-header"><div><Eyebrow>Launch vision &amp; impact</Eyebrow><h2 id="launch-vision-title">Moving Liberia forward through mobility.</h2></div><div className="vision-statement"><span>Our vision</span><p>To become Liberia&apos;s leading technology-powered mobility platform connecting people, businesses, and opportunities.</p></div></div>
    <div className="launch-goals-block"><div className="launch-goals-label"><strong>Launch goals</strong><span>Forward-looking targets—not current operating results.</span></div><div className="launch-goals-grid">{launchGoals.map(([value,label,description])=><article key={label}><strong>{value}</strong><h3>{label}</h3><p>{description}</p></article>)}</div></div>
    <div className="impact-grid"><div className="impact-intro"><span>Why this matters</span><h3>A locally grounded platform with room to create national value.</h3><p>LibSwiftRide&apos;s growth model is designed around practical mobility needs, responsible expansion and measurable value for the communities it serves.</p></div><div className="impact-points">{impactPoints.map(([title,description],index)=><article key={title}><span>0{index+1}</span><div><h4>{title}</h4><p>{description}</p></div></article>)}</div></div>
    <div className="investor-note"><span>Investor confidence</span><p>Our proposition combines a clearly defined local problem, scalable platform infrastructure, diversified passenger and business use cases, and a disciplined approach to safety, operations and financial transparency.</p><Link className="arrow-link" href="/investors">Explore the opportunity <span aria-hidden="true">→</span></Link></div>
  </div></section>;
}

function InvestorsPage() {
  const [enquiryStatus, setEnquiryStatus] = useState("");
  const opportunity = [
    ["Urban growth", "Increasing movement across Greater Monrovia creates demand for more reliable and coordinated transportation solutions."],
    ["Digital adoption", "More users are embracing technology-based services, creating room for locally relevant booking, tracking and support."],
    ["Business need", "Companies, NGOs and institutions need safer employee mobility, policy controls, consolidated billing and reporting."],
    ["Employment opportunity", "Driver and fleet partnerships can create clearer access to demand, transparent trip information and income opportunities."],
  ];
  const revenues = [
    ["Passenger rides", "LibSwiftRide earns a 14% platform commission from completed fares while the driver receives 86%."],
    ["Business mobility", "Corporate transportation programmes create recurring value through account controls, reporting and monthly service arrangements."],
    ["Driver & fleet partnerships", "Platform services connect verified drivers and fleet operators to demand, operational tools and transparent performance information."],
    ["Future expansion", "Delivery, logistics, airport and additional mobility services can extend platform value as operations and compliance mature."],
  ];
  const fundingUses = [
    ["Technology development", "Improve booking, dispatch, live tracking, payments, reporting, security and platform reliability."],
    ["Driver onboarding", "Support verification, vehicle readiness, training and a dependable supply network."],
    ["Customer acquisition", "Build trusted awareness through measured marketing, partnerships and launch programmes."],
    ["Operations team", "Strengthen dispatch, customer support, finance, compliance and service-quality operations."],
    ["Safety infrastructure", "Expand incident response, trip monitoring, verification and vehicle-standard workflows."],
    ["Liberia expansion", "Prepare new service areas only after demand, support, supply and regulatory readiness are demonstrated."],
  ];
  const impact = [
    ["Employment pathways", "Create opportunities across driving, operations, support, technology and fleet services."],
    ["Safer mobility", "Strengthen accountability through verification, trip monitoring, safety tools and documented operations."],
    ["Digital participation", "Help passengers, drivers and businesses benefit from locally relevant mobility technology."],
    ["Economic connection", "Make it easier for people to reach work, education, services, airports and commercial opportunities."],
  ];
  const scale = [
    ["01", "Prove Greater Monrovia", "Build reliable supply, trip quality, support and repeat usage in the initial operating area."],
    ["02", "Deepen business mobility", "Grow structured transport programmes for companies, NGOs, hotels and institutions."],
    ["03", "Expand service coverage", "Enter additional Liberian communities through readiness gates, local partnerships and measured demand."],
    ["04", "Extend the platform", "Scale delivery, fleet, airport and mobility-finance capabilities only as operations and compliance mature."],
  ];
  const partnerships = [
    ["Strategic investment", "Capital and operating expertise for responsible growth, product maturity and service expansion."],
    ["Corporate mobility", "Employee, executive, airport and guest transportation programmes for organisations."],
    ["Fleet partnerships", "Verified vehicle supply, driver operations and fleet-performance collaboration."],
    ["Institutional collaboration", "Mobility initiatives with NGOs, universities, hotels, communities and public institutions."],
    ["Technology & payments", "Infrastructure, mapping, communications and regulated payment-provider partnerships."],
    ["Safety ecosystem", "Collaboration supporting verification, insurance, emergency response and vehicle standards."],
  ];
  return <Layout>
    <section className="investor-hero"><div className="container investor-hero-grid"><div><Eyebrow>Investment &amp; partnerships</Eyebrow><h1>Invest in Liberia&apos;s Next Mobility Platform</h1><p>LibSwiftRide is building a technology-powered transportation ecosystem connecting passengers, drivers, businesses, and communities across Liberia.</p><div className="hero-buttons"><a className="button" href="#partnership-opportunities">Partner With Us</a><a className="button secondary" href="#investor-enquiry">Investment Enquiry</a><a className="investor-download-link" href="/documents/libswiftride-investor-deck.pdf" download>Download Investor Deck (PDF) <span aria-hidden="true">↓</span></a></div><small>Investor presentation page · Forward-looking plans are subject to operational, regulatory and financing readiness.</small></div><div className="investor-signal"><span>Platform economics</span><strong>86 / 14</strong><div><b>86%</b><small>Driver earnings share</small></div><div><b>14%</b><small>Platform commission</small></div></div></div></section>
    <section className="section investor-opportunity"><div className="container"><div className="section-heading"><div><Eyebrow>Why Liberia, why now?</Eyebrow><h2>Why Liberia&apos;s mobility market is ready.</h2></div><p>LibSwiftRide is designed around visible transport and digital-service trends without presenting unverified population, adoption or market-size figures.</p></div><div className="investor-opportunity-grid">{opportunity.map(([title,body],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
    <section className="section solution-band"><div className="container investor-solution-grid"><div><Eyebrow>Our solution</Eyebrow><h2>One platform connecting the entire mobility journey.</h2><p>Passenger booking, driver operations, live trip visibility, business controls, payments, safety workflows and reporting work together as a coordinated system.</p></div><div className="solution-stack">{["Passenger mobility","Verified driver network","Business transportation","Fleet operations","Safety & support","Data & reporting"].map((item,index)=><div key={item}><span>{String(index+1).padStart(2,"0")}</span><strong>{item}</strong></div>)}</div></div></section>
    <section className="section founder-story-section"><div className="container founder-story-grid"><Portrait leader={leaders[0]!} large /><div><Eyebrow>The story behind LibSwiftRide</Eyebrow><h2>A Liberian mobility platform built from local realities.</h2><p>Founder Jerry G. Toe started LibSwiftRide with a practical ambition: build transportation technology around Liberia rather than importing assumptions from other markets.</p><p>The platform responds to visible challenges faced by passengers, drivers and organisations—uncertain trip information, fragmented coordination, limited operational visibility and a need for mobility tools aligned with local payment and support expectations.</p><div className="founder-vision"><span>Founder&apos;s vision</span><p>Connect Liberia through safer, more dependable and technology-powered mobility while creating transparent opportunity for drivers and useful transport infrastructure for businesses.</p></div><ArrowLink href="/leadership/jerry-toe">Meet the founder</ArrowLink></div></div></section>
    <section className="section revenue-section" id="revenue-model"><div className="container"><div className="section-heading"><div><Eyebrow>How LibSwiftRide generates revenue</Eyebrow><h2>A diversified mobility revenue model.</h2></div><p>Revenue grows with completed mobility services and structured organisational use—not through undisclosed deductions from drivers.</p></div><div className="revenue-grid">{revenues.map(([title,body],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
    <section className="section impact-section"><div className="container"><div className="section-heading"><div><Eyebrow>Social and economic impact</Eyebrow><h2>Growth designed to create local value.</h2></div><p>Platform expansion is intended to strengthen opportunity while maintaining safety, service quality and financial discipline.</p></div><div className="investor-impact-grid">{impact.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
    <section className="section scalability-section"><div className="container investor-solution-grid"><div><Eyebrow>Scalability plan</Eyebrow><h2>Expand through evidence, readiness and local partnerships.</h2><p>Each stage depends on measurable demand, driver supply, support coverage, compliance and service-quality thresholds.</p></div><div className="scale-timeline">{scale.map(([number,title,body])=><article key={title}><b>{number}</b><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></div></section>
    <section className="section growth-roadmap-section"><div className="container"><div className="section-heading"><div><Eyebrow>LibSwiftRide growth roadmap</Eyebrow><h2>Three phases toward a national mobility network.</h2></div><p>This roadmap is forward-looking and conditional on financing, regulatory readiness, operational quality and demonstrated demand.</p></div><div className="growth-roadmap">{[
      ["Phase 1","Monrovia launch",["Passenger platform","Driver onboarding","Business accounts"]],
      ["Phase 2","Regional expansion",["Paynesville service depth","Kakata readiness","Buchanan readiness"]],
      ["Phase 3","National mobility network",["Priority county expansion","Logistics integration","Connected fleet services"]],
    ].map(([phase,title,items],index)=><article key={String(phase)}><div className="roadmap-marker"><b>{index+1}</b><span /></div><span>{phase}</span><h3>{title}</h3><ul>{(items as string[]).map((item)=><li key={item}>{item}</li>)}</ul></article>)}</div></div></section>
    <section className="section target-metrics-section"><div className="container"><div className="section-heading"><div><Eyebrow>36-month planning targets</Eyebrow><h2>Measurable goals for disciplined execution.</h2></div><p>Illustrative future targets—not current achievements or guaranteed forecasts. Final targets depend on capital, launch performance and approved operating plans.</p></div><div className="target-metrics-grid">{[
      ["50,000","Registered riders"],
      ["5,000","Driver partners"],
      ["500","Business accounts"],
      ["15","Service locations"],
    ].map(([value,label])=><article key={label}><strong>{value}</strong><span>{label}</span><small>36-month target</small></article>)}</div></div></section>
    <section className="section funding-section"><div className="container"><div className="section-heading"><div><Eyebrow>Use of investment</Eyebrow><h2>Investment will accelerate disciplined platform growth.</h2></div><p>Final allocations will depend on financing, launch readiness and an approved operating plan.</p></div><div className="investment-table" role="table" aria-label="Proposed use of investment"><div className="investment-table-head" role="row"><span role="columnheader">Area</span><span role="columnheader">Purpose</span></div>{fundingUses.map(([title,body],index)=><div className="investment-table-row" role="row" key={title}><b aria-hidden="true">{String(index+1).padStart(2,"0")}</b><strong role="cell">{title}</strong><span role="cell">{body}</span></div>)}</div></div></section>
    <section className="section partnership-section" id="partnership-opportunities"><div className="container"><div className="section-heading"><div><Eyebrow>Partnership opportunities</Eyebrow><h2>Build the mobility ecosystem with us.</h2></div><p>We welcome aligned partners who bring responsible capital, operational capability, trusted infrastructure or access to mobility demand.</p></div><div className="partnership-grid">{partnerships.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
    <section className="section investor-trust-section"><div className="container investor-trust-grid"><div><Eyebrow>Built with transparency</Eyebrow><h2>Clear information for serious due diligence.</h2><p>LibSwiftRide is committed to presenting verified operating facts, separating projections from results, and sharing appropriate company documentation through a structured investor-review process.</p></div><div className="investor-trust-list">{[
      ["Business information", "Registration and corporate records can be reviewed through formal due diligence once verified for release.", "Due diligence"],
      ["Leadership team", "Approved executive profiles, responsibilities and photographs are available on the public Leadership page.", "Public"],
      ["Development roadmap", "The platform roadmap documents staged product, operational, safety and expansion priorities.", "Review ready"],
      ["Financial projections", "Assumptions and projections can be discussed with qualified parties and are never presented as historical results.", "On request"],
    ].map(([title,body,status])=><article key={title}><div><h3>{title}</h3><p>{body}</p></div><span>{status}</span></article>)}</div></div></section>
    <section className="section investor-enquiry-section" id="investor-enquiry"><div className="container investor-enquiry-grid"><div><Eyebrow>Investor enquiry</Eyebrow><h2>Start a focused conversation.</h2><p>Tell us about your organisation and area of interest. This local demonstration validates the enquiry experience but does not transmit or store submitted information.</p><div className="enquiry-contact-note"><strong>Prefer a direct introduction?</strong><span>Use the public Contact page to reach the partnerships team.</span><Link className="arrow-link" href="/contact?intent=investment">Open contact page <span aria-hidden="true">→</span></Link></div></div><form className="investor-enquiry-form" onSubmit={(event)=>{event.preventDefault();setEnquiryStatus("Enquiry prepared successfully. No information was transmitted from this local demonstration.");}}><div className="form-row"><label>Full name<input name="name" autoComplete="name" required /></label><label>Work email<input name="email" type="email" autoComplete="email" required /></label></div><label>Organisation<input name="organisation" autoComplete="organization" required /></label><label>Area of interest<select name="interest"><option>Strategic investment</option><option>Corporate mobility</option><option>Fleet partnership</option><option>Technology or payments</option><option>Institutional collaboration</option><option>Safety ecosystem</option></select></label><label>Message<textarea name="message" rows={5} required /></label><button className="button" type="submit">Prepare Investment Enquiry</button><p className="enquiry-status" aria-live="polite">{enquiryStatus}</p></form></div></section>
  </Layout>;
}

function ServicesPage() {
  return <Layout><PageHero eyebrow="Mobility services" title="The right movement for every moment." description="Personal travel, business transport, airport transfers, deliveries and fleet operations—connected by one reliable Liberian platform." action={<Link className="button" href={passengerAppUrl}>Book a Ride</Link>} /><section className="section"><div className="container service-grid expanded">{services.map(([number,title,body])=><article className="service-card" key={title}><span>{number}</span><h3>{title}</h3><p>{body}</p><ul><li>Clear status updates</li><li>Safety-led workflows</li><li>Local support</li></ul></article>)}</div></section><HowItWorks /><BusinessPreview /></Layout>;
}

function SafetyPage() {
  return <Layout><PageHero eyebrow="Safety at LibSwiftRide" title="A safer platform starts before the trip." description="We combine verification, live operational visibility, emergency tools and accountable feedback to support passengers, drivers and partners." /><section className="section"><div className="container safety-cards">{safetyFeatures.map(([tag,title,body])=><article key={title}><span>{tag}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section><section className="section dark-section"><div className="container split-feature"><div><Eyebrow>During every ride</Eyebrow><h2>Information when it matters most.</h2><p>Passengers can confirm their vehicle and driver, use a ride PIN, follow trip status, share the journey and reach emergency support. Drivers receive clear passenger and route information with access to incident reporting.</p></div><div className="safety-timeline">{["Driver and vehicle confirmed","Ride PIN verified","Live journey monitored","Receipt and ratings completed"].map((item,index)=><div key={item}><b>{index+1}</b><span>{item}</span></div>)}</div></div></section></Layout>;
}

function BusinessPage() {
  return <Layout><PageHero eyebrow="Business mobility" title="Move your people. Control your programme." description="Give employees dependable transportation while finance and operations teams manage policy, budgets, billing and reporting." action={<Link className="button" href={businessAppUrl}>Create a Business Account</Link>} /><section className="section"><div className="container feature-six">{["Employee transportation","Business travel","Monthly billing","Trip reporting","Ride approval rules","Fleet and transport controls"].map((title,index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{["Give approved employees a simple way to book work travel.","Separate business journeys from personal transportation.","Consolidate eligible activity into a clear billing cycle.","Understand routes, spend, usage and policy compliance.","Set employee limits, schedules and approval requirements.","Coordinate company mobility and fleet resources together."][index]}</p></article>)}</div></section><BusinessPreview /></Layout>;
}

function DrivePage() {
  return <Layout><PageHero eyebrow="Drive with LibSwiftRide" title="Your time. Your vehicle. Clearer earnings." description="Join a driver platform designed for flexible work, transparent trip information, support and safety in Liberia." action={<Link className="button" href={driverAppUrl}>Become a Driver</Link>} /><section className="section"><div className="container split-feature"><div><Eyebrow>Why drivers join</Eyebrow><h2>Tools that respect the work.</h2><div className="benefit-list large">{["Keep 86% of every completed fare","Choose when you are available","See route and earning information clearly","Track daily, weekly and monthly performance","Access support and safety incident tools"].map(item=><div key={item}><span>✓</span>{item}</div>)}</div></div><div className="application-flow">{[["Apply online","Create your account and provide your driver information."],["Submit documents","Add your licence, identity, vehicle and insurance details."],["Complete review","Our team reviews eligibility and vehicle requirements."],["Start earning","Go online after approval and accept trips that work for you."]].map(([title,body],index)=><article key={title}><b>{index+1}</b><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></div></section><SafetyPreview /></Layout>;
}

function AboutPage() {
  return <Layout><PageHero eyebrow="About LibSwiftRide" title="A mobility company built with Liberia in mind." description="LibSwiftRide exists to make transportation safer, more dependable and more useful for passengers, drivers, communities and businesses." /><LiberiaSection /><section className="section"><div className="container values-grid">{[["Mission","Connect Liberia through trusted, technology-powered mobility."],["Vision","A future where safe transportation and earning opportunity are accessible across Liberia."],["Commitment","Grow responsibly with local insight, operational discipline and financial transparency."]].map(([title,body])=><article key={title}><Eyebrow>{title}</Eyebrow><h2>{body}</h2></article>)}</div></section><LeadershipPreview /></Layout>;
}

function LeadershipPage() {
  return <Layout><PageHero eyebrow="Our leadership" title="Local leadership. Long-term ambition." description="Meet the people guiding LibSwiftRide’s mission, operations and commitment to reliable mobility for Liberia." /><section className="section"><div className="container leader-grid page-leaders">{leaders.map((leader)=><article className="leader-card" key={leader.slug}><Portrait leader={leader} /><div><span>{leader.role}</span><h2>{leader.name}</h2><p>{leader.summary}</p><ArrowLink href={`/leadership/${leader.slug}`}>Read full biography</ArrowLink></div></article>)}</div></section></Layout>;
}

function LeaderProfile({ leader }: { leader: typeof leaders[number] }) {
  const isFounder = leader.slug === "jerry-toe";
  return <Layout><section className="profile-hero"><div className="container profile-grid"><Portrait leader={leader} large /><div><Eyebrow>Executive leadership</Eyebrow><h1>{leader.name}</h1><h2>{leader.role}</h2><p>{leader.bio}</p><Link href="/leadership" className="arrow-link">← Back to leadership</Link></div></div></section><section className="section leader-biography"><div className="container biography-grid"><aside><span>Leadership profile</span>{(isFounder ? ["Professional biography","Vision","Founder story","Strategic focus"] : ["Professional biography","Operations role","Organisational leadership","Service focus"]).map((item)=><a href={`#${item.toLowerCase().replaceAll(" ","-")}`} key={item}>{item}</a>)}</aside><article className="prose"><h2 id="professional-biography">Professional biography</h2><p>{leader.bio}</p><h2 id={isFounder ? "vision" : "operations-role"}>{isFounder ? "Vision" : "Operations role"}</h2><p>{isFounder ? "Jerry’s vision is a connected Liberian mobility network where passengers can travel with greater confidence, drivers can build transparent earning opportunities, and businesses can manage transportation with dependable digital tools." : "Matthew translates LibSwiftRide’s strategy into consistent daily operations. His remit connects driver onboarding, vehicle readiness, trip quality, safety coordination and customer support so growth remains controlled and accountable."}</p><h2 id={isFounder ? "founder-story" : "organisational-leadership"}>{isFounder ? "Founder story" : "Organisational leadership"}</h2><p>{isFounder ? "LibSwiftRide began with a practical ambition: build transportation technology around Liberia rather than importing assumptions from other markets. Jerry’s founder journey centres on listening to local passengers, drivers and businesses, then turning those needs into a platform designed for long-term national value." : "Matthew’s leadership approach emphasises clear standards, measurable performance and coordinated teams. He supports an operating culture in which drivers, fleet partners and customer-service teams understand their responsibilities and have the tools to deliver reliable journeys."}</p><h2 id={isFounder ? "strategic-focus" : "service-focus"}>{isFounder ? "Strategic focus" : "Service focus"}</h2><p>{leader.summary} The work is grounded in safety, responsible growth, service quality and a belief that mobility should create value for every participant in the network.</p><div className="profile-note"><strong>Accuracy commitment</strong><p>Education and earlier employment details will be published only after the executive biography has been formally verified and approved.</p></div></article></div></section></Layout>;
}

function ContactPage() {
  return <Layout><PageHero eyebrow="Contact LibSwiftRide" title="Let’s move the conversation forward." description="Choose the team that best matches your enquiry. For an active ride or urgent safety concern, use in-app support." /><section className="section"><div className="container contact-grid"><div className="contact-options"><article><h3>Company phone</h3><p>Call the registered LibSwiftRide company number.</p><a href={`tel:${companyPhone}`}>{companyPhone} →</a></article>{([["Passenger support","Ride questions, receipts and account help."],["Driver support","Applications, documents and driver operations."],["Business","Employee transportation and billing programmes."],["Partnerships","Fleet, airport and community mobility opportunities."]] as const).map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p><a href={`mailto:${title.toLowerCase().split(" ")[0]}@libswiftride.example`}>Email team →</a></article>)}</div><form className="contact-form" onSubmit={(event)=>event.preventDefault()}><h2>Send an enquiry</h2><label>Full name<input required /></label><label>Work email<input type="email" required /></label><label>Topic<select><option>Passenger support</option><option>Driver application</option><option>Business account</option><option>Fleet partnership</option></select></label><label>Message<textarea rows={5} required /></label><button className="button" type="submit">Prepare message</button><small>Demonstration form. No message is transmitted from this local preview.</small></form></div></section></Layout>;
}

function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const privacy = type === "privacy";
  return <Layout><PageHero eyebrow={privacy ? "Privacy Policy" : "Terms of Service"} title={privacy ? "Your information deserves careful protection." : "Clear expectations for using LibSwiftRide."} description={`Local demonstration policy summary · Last updated July 2026`} /><section className="section"><article className="container narrow prose"><h2>{privacy ? "Information we handle" : "Using the platform"}</h2><p>{privacy ? "LibSwiftRide processes account, booking, trip, location, payment-status and support information needed to provide mobility services. Sensitive information is limited, access-controlled and never intended for public display." : "Users must provide accurate account information, respect passengers and drivers, follow safety requirements and use the platform only for lawful transportation and delivery activities."}</p><h2>{privacy ? "How information is used" : "Fares and payments"}</h2><p>{privacy ? "Information supports booking, dispatch, safety, customer support, fraud prevention, billing and service improvement. Precise location history is restricted and retained only according to documented operational needs." : "Fare estimates and final charges are calculated by the platform. Available payment methods and any fees are shown during booking. Provider availability may vary by service area."}</p><h2>{privacy ? "Your choices" : "Safety and conduct"}</h2><p>{privacy ? "You may request access, correction or account support through the Contact page. Some records must be retained for safety, legal, financial or dispute-resolution requirements." : "Harassment, unsafe conduct, fraud and misuse are prohibited. LibSwiftRide may suspend access when necessary to protect users, investigate incidents or comply with applicable requirements."}</p><h2>Contact</h2><p>Questions about this policy can be directed through the LibSwiftRide Contact page. Final production policies will be reviewed for applicable Liberian requirements before launch.</p></article></section></Layout>;
}

function DriverTermsPage() {
  return <Layout><PageHero eyebrow="Driver Terms" title="Clear standards for earning with LibSwiftRide." description="Local demonstration policy summary · Last updated August 2026" /><section className="section"><article className="container narrow prose"><h2>Driver eligibility</h2><p>Drivers must provide accurate identity, licence, vehicle, insurance and other required information. Access to trips begins only after verification and onboarding review.</p><h2>Trips and earnings</h2><p>Drivers receive 86% of every completed fare. LibSwiftRide retains a 14% platform commission. Trip records, adjustments and approved incentives are shown transparently.</p><h2>Safety and conduct</h2><p>Drivers must operate safely, treat passengers respectfully, protect passenger information and report incidents promptly. Fraud, harassment, unsafe driving and account sharing are prohibited.</p><h2>Demonstration status</h2><p>This preview does not activate real trips or live payments. Final driver terms will be reviewed for applicable Liberian requirements before public launch.</p></article></section></Layout>;
}

function NotFound() {
  return <Layout><section className="not-found"><Eyebrow>404</Eyebrow><h1>This road does not go there.</h1><p>The page may have moved, but your next journey is one click away.</p><Link href="/" className="button">Return home</Link></section></Layout>;
}

function App() {
  const [path, setPath] = useState(window.location.pathname.replace(/\/+$/, "") || "/");
  useEffect(() => {
    const update = () => setPath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    const labels: Record<string,string> = {"/":"Liberia Moves Better","/about":"About","/services":"Services","/safety":"Safety","/business":"Business","/drive":"Drive","/leadership":"Leadership","/investors":"Investment & Partnerships","/leadership/jerry-toe":"Jerry G. Toe","/leadership/matthew-gaye":"Matthew P. Gaye Jr.","/leadership/jerry-g-toe":"Jerry G. Toe","/leadership/matthew-p-gaye-jr":"Matthew P. Gaye Jr.","/contact":"Contact","/faq":"FAQ","/privacy":"Privacy Policy","/terms":"Terms of Service","/driver-terms":"Driver Terms"};
    document.title = `${labels[path] ?? "LibSwiftRide"} | LibSwiftRide`;
  }, [path]);
  if (!allRoutes.has(path)) return <NotFound />;
  if (path === "/") return <Home />;
  if (path === "/services") return <ServicesPage />;
  if (path === "/safety") return <SafetyPage />;
  if (path === "/business") return <BusinessPage />;
  if (path === "/drive") return <DrivePage />;
  if (path === "/about") return <AboutPage />;
  if (path === "/investors") return <InvestorsPage />;
  if (path === "/leadership") return <LeadershipPage />;
  if (path === "/leadership/jerry-toe" || path === "/leadership/jerry-g-toe") return <LeaderProfile leader={leaders[0]!} />;
  if (path === "/leadership/matthew-gaye" || path === "/leadership/matthew-p-gaye-jr") return <LeaderProfile leader={leaders[1]!} />;
  if (path === "/contact") return <ContactPage />;
  if (path === "/faq") return <Layout><PageHero eyebrow="Frequently asked questions" title="Useful answers for every journey." description="Booking, pricing, driving, safety, business travel and support—all in one place." /><FaqPreview full /></Layout>;
  if (path === "/privacy") return <LegalPage type="privacy" />;
  if (path === "/terms") return <LegalPage type="terms" />;
  if (path === "/driver-terms") return <DriverTermsPage />;
  return <NotFound />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
