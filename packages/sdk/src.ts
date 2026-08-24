const environment = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const API_URL = environment?.VITE_API_URL ?? "http://localhost:4000/api/v1";
const WS_URL = environment?.VITE_WS_URL ?? "ws://localhost:4000/ws";

export type ApiError = { error: { code: string; message: string; details?: unknown } };
export class ApiRequestError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}
export type SessionTokens = { accessToken: string; refreshToken: string };
export type LoginResult = {
  data: { id: string; role: string };
  tokens?: SessionTokens;
  mfaRequired?: boolean;
  challengeToken?: string;
  mfaEnrollmentRequired?: boolean;
  enrollmentToken?: string;
};
const accessTokenKey = "lsr_access_token";
const refreshTokenKey = "lsr_refresh_token";

function requestUrl(path: string) {
  try {
    return new URL(path.replace(/^\/+/, ""), `${API_URL.replace(/\/+$/, "")}/`).href;
  } catch {
    throw new ApiRequestError("API_MISCONFIGURED", "LibSwiftRide is not connected to a valid API service. Please contact support.");
  }
}

function isFrontendFallback(response: Response) {
  if (typeof window === "undefined" || response.status !== 404) return false;
  try {
    return new URL(response.url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function storedToken(key: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key) ?? "";
}

export class LibSwiftRideClient {
  private refreshPromise: Promise<boolean> | null = null;

  constructor(private accessToken = storedToken(accessTokenKey)) {}

  setSession(tokens: SessionTokens, persistent = true) {
    this.accessToken = tokens.accessToken;
    if (typeof window === "undefined") return;
    const storage = persistent ? window.localStorage : window.sessionStorage;
    const alternate = persistent ? window.sessionStorage : window.localStorage;
    storage.setItem(accessTokenKey, tokens.accessToken);
    storage.setItem(refreshTokenKey, tokens.refreshToken);
    alternate.removeItem(accessTokenKey);
    alternate.removeItem(refreshTokenKey);
    window.dispatchEvent(new CustomEvent("lsr-session-changed", { detail: { authenticated: true } }));
  }

  clearSession() {
    this.accessToken = "";
    if (typeof window === "undefined") return;
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage.removeItem(accessTokenKey);
      storage.removeItem(refreshTokenKey);
    }
    window.dispatchEvent(new CustomEvent("lsr-session-changed", { detail: { authenticated: false } }));
  }

  hasSession() {
    return Boolean(this.accessToken || storedToken(refreshTokenKey));
  }

  async login(phone: string, password: string, persistent = true, expectedRole?: string) {
    const result = await this.request<LoginResult>("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }), skipAuthRefresh: true });
    if (expectedRole && result.data.role !== expectedRole) {
      throw new ApiRequestError("WRONG_PORTAL", `This account cannot access the ${expectedRole.toLowerCase().replaceAll("_", " ")} portal.`, 403);
    }
    if (result.tokens) this.setSession(result.tokens, persistent);
    return result;
  }

  async completeMfa(path: "/auth/mfa/challenge" | "/auth/mfa/enrollment/confirm", input: Record<string, string>, persistent = true) {
    const result = await this.request<{ data: { id: string; role: string }; tokens: SessionTokens }>(path, { method: "POST", body: JSON.stringify(input), skipAuthRefresh: true });
    this.setSession(result.tokens, persistent);
    return result;
  }

  async register(input: { phone: string; email?: string; password: string; firstName: string; lastName: string; role: "PASSENGER" | "DRIVER"; referralCode?: string }, persistent = true) {
    const result = await this.request<{ data: { id: string; role: string }; tokens: SessionTokens }>("/auth/register", { method: "POST", body: JSON.stringify(input), skipAuthRefresh: true });
    this.setSession(result.tokens, persistent);
    return result;
  }

  async restoreSession() {
    if (this.accessToken) return true;
    return this.refreshSession();
  }

  async logout() {
    const refreshToken = storedToken(refreshTokenKey);
    try {
      if (refreshToken) await this.request("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }), skipAuthRefresh: true });
    } finally {
      this.clearSession();
    }
  }

  private async refreshSession() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const refreshToken = storedToken(refreshTokenKey);
      if (!refreshToken) return false;
      try {
        const response = await fetch(requestUrl("/auth/refresh"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) throw new Error("Session refresh failed");
        const result = await response.json() as { tokens: SessionTokens };
        this.setSession(result.tokens, Boolean(window.localStorage.getItem(refreshTokenKey)));
        return true;
      } catch {
        this.clearSession();
        return false;
      }
    })().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async request<T>(path: string, init: RequestInit & { idempotencyKey?: string; skipAuthRefresh?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);
    if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
    const { skipAuthRefresh, ...requestInit } = init;
    let response: Response;
    try {
      response = await fetch(requestUrl(path), { ...requestInit, headers });
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError("NETWORK_FAILURE", "Unable to reach LibSwiftRide. Check your connection and try again.");
    }
    if (response.status === 401 && !skipAuthRefresh && await this.refreshSession()) {
      headers.set("authorization", `Bearer ${this.accessToken}`);
      try {
        response = await fetch(requestUrl(path), { ...requestInit, headers });
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        throw new ApiRequestError("NETWORK_FAILURE", "Unable to reach LibSwiftRide. Check your connection and try again.");
      }
    }
    if (isFrontendFallback(response)) throw new ApiRequestError("API_MISCONFIGURED", "This LibSwiftRide site is connected to the frontend instead of the API service. Please contact support.", response.status);
    let body: unknown;
    if (response.status !== 204) {
      const responseText = await response.text();
      if (responseText) {
        try {
          body = JSON.parse(responseText) as unknown;
        } catch {
          throw new ApiRequestError(
            "INVALID_RESPONSE",
            "LibSwiftRide returned an invalid server response. Please try again.",
            response.status
          );
        }
      }
    }
    if (!response.ok) {
      const apiError = (body as ApiError | undefined)?.error;
      throw new ApiRequestError(apiError?.code ?? "REQUEST_FAILED", apiError?.message ?? `Request failed (${response.status})`, response.status);
    }
    return body as T;
  }

  async download(path: string) {
    const headers = new Headers();
    if (this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);
    const response = await fetch(requestUrl(path), { headers });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as ApiError | undefined;
      throw new Error(body?.error?.message ?? `Download failed (${response.status})`);
    }
    return response.blob();
  }

  connect() {
    if (!this.accessToken) throw new Error("Sign in before connecting");
    const encoded = btoa(this.accessToken).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    return new WebSocket(WS_URL, ["libswiftride", `auth.${encoded}`]);
  }
}

export const apiClient = new LibSwiftRideClient();

function applicationServerKey(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function registerWebPushDevice() {
  const publicKey = environment?.VITE_WEB_PUSH_PUBLIC_KEY?.trim();
  if (!publicKey) throw new ApiRequestError("PUSH_NOT_CONFIGURED", "Push notifications are not configured for this environment.");
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new ApiRequestError("PUSH_UNSUPPORTED", "Push notifications are not supported by this browser.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new ApiRequestError("PUSH_PERMISSION_DENIED", "Notification permission was not granted.");
  const registration = await navigator.serviceWorker.register("/service-worker.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
  const pushToken = JSON.stringify(subscription.toJSON());
  const response = await apiClient.request<{ data: { id: string } }>("/devices", { method: "POST", body: JSON.stringify({ platform: "web", pushToken }) });
  return response.data;
}
export const supportedLocales = ["en", "fr"] as const;
export type SupportedLocale = typeof supportedLocales[number];
export const messages = {
  en: { loading: "Loading", empty: "Nothing to show yet", retry: "Try again", pickup: "Pickup", destination: "Destination", payment: "Payment", bookRide: "Book now", getEstimate: "Get estimate", rideStatus: "Ride status" },
  fr: { loading: "Chargement", empty: "Aucun élément à afficher", retry: "Réessayer", pickup: "Lieu de départ", destination: "Destination", payment: "Paiement", bookRide: "Réserver", getEstimate: "Obtenir une estimation", rideStatus: "Statut de la course" }
} as const satisfies Record<SupportedLocale, Record<string, string>>;
export const message = (locale: SupportedLocale, key: keyof typeof messages.en) => messages[locale][key];
export const passengerMessages = {
  en: {
    passengerHome: "Passenger home", whereTo: "Where to?", language: "Language", useGps: "Use my GPS location", findingLocation: "Finding your location…", chooseRide: "Choose your ride", economy: "Economy", economyDetail: "Affordable everyday rides", selected: "Selected", promoCode: "Promo code", optional: "Optional", scheduleLater: "Schedule for later", saveHome: "Save pickup as Home", saveWork: "Save destination as Work", cash: "Cash", confirmRide: "Confirm Ride", requesting: "Requesting…", activeRideExists: "Ride already active", estimatedTrip: "Estimated trip", fare: "Fare", distance: "Distance", tripDuration: "Trip duration", rideType: "Ride type", currentRide: "Current ride", sosEmergency: "SOS emergency", cancelRide: "Cancel this ride", recentRides: "Your recent rides", notifications: "Notifications", receipt: "Trip receipt", downloadPdf: "Download PDF", savedPlaces: "Saved places", useAsPickup: "Use as pickup", useAsDestination: "Use as destination", noSavedPlaces: "Save Home or Work to reuse it here.", limitedOffer: "Limited-time offer", offRide: "off your ride", expires: "Expires", applied: "Applied", apply: "Apply", referralWallet: "Referral wallet", inviteEarn: "Invite friends and earn", availableBalance: "Available wallet balance", referralExplanation: "Earn 2% of your referred passenger's first completed ride fare. Rewards are credited after the ride qualifies.", yourReferralCode: "Your referral code", signInCode: "Sign in to view your code", copied: "Copied", copyCode: "Copy code", totalReferrals: "Total referrals", rewardsEarned: "Rewards earned", totalRewards: "Total referral rewards", rewardActivity: "Reward activity", friendReferral: "Friend referral", pending: "Pending", closeReceipt: "Close receipt", rideChat: "Ride chat", chatMessage: "Message", send: "Send", deliveryService: "Delivery service", sendParcel: "Send a parcel", requestSampleRoute: "Request sample route", deliveryExplanation: "Delivery fares and the 86/14 allocation are calculated by the API. Recipient details are visible only to authorized delivery participants.", route: "Route", status: "Status", monthlyPasses: "Monthly passes", rideCredits: "Your ride credits", ridesRemaining: "rides remaining", noActivePass: "No active pass. Pass purchasing remains unavailable until its sandbox payment flow is certified.", noNotifications: "No new notifications."
    ,emergencyAssistance: "Emergency assistance", sendSosAlert: "Send an SOS alert?", emergencyType: "Emergency type", securityThreat: "Security threat", medicalEmergency: "Medical emergency", crashCollision: "Crash or collision", harassment: "Harassment", otherEmergency: "Other emergency", details: "Details", responderInfo: "Add information that may help responders", sendingSos: "Sending SOS…", sendSosNow: "Send SOS now", goBack: "Go back", cancellation: "Cancellation", cancelQuestion: "Cancel this ride?", reason: "Reason", plansChanged: "Plans changed", driverTooLong: "Driver is taking too long", pickupIncorrect: "Pickup location is incorrect", bookedMistake: "Booked by mistake", safetyConcern: "Safety concern", other: "Other", cancelling: "Cancelling…", confirmCancellation: "Confirm cancellation", keepRide: "Keep my ride", unreadNotifications: "unread notifications", rating: "Rating", view: "View", signInHistory: "Sign in to view bookings and receipts.", boarded: "I have boarded", share: "Share", cancel: "Cancel"
    ,completionPending: "Completion time pending", to: "to", baseFare: "Base fare", demandAdjustment: "Demand adjustment", waitingFee: "Waiting fee", tolls: "Tolls", subtotal: "Subtotal", discount: "Discount", totalPaid: "Total paid", refunded: "Refunded", driver: "Driver", notAssigned: "Not assigned", fareAllocation: "Fare allocation", platform: "Platform", ratings: "ratings", newDriver: "New driver · no ratings yet", vehiclePending: "Vehicle details pending", platePending: "Plate pending", matchingDriver: "We are matching you with the nearest available verified driver.", confirmVehicle: "Confirm I am in the vehicle", paymentConfirmed: "Payment confirmed.", cashPaymentHint: "Pay the driver in cash when the trip is complete.", electronicPaymentHint: "Electronic payment confirmation is required before trip completion."
    ,emergencyExplanation: "This alerts LibSwiftRide safety operators and records the incident against this active ride. If you are in immediate danger, contact local emergency services when it is safe to do so.", emergencyGpsHint: "We will request your current GPS location. If permission is unavailable, the alert will still be sent without coordinates.", cancelExplanation: "The ride will end immediately and an assigned driver will be notified. Cancellation charges may apply when production pricing rules are enabled.", paymentLabel: "Payment", allocationDriver: "Driver", allocationPlatform: "Platform"
  },
  fr: {
    passengerHome: "Accueil passager", whereTo: "Où allez-vous ?", language: "Langue", useGps: "Utiliser ma position GPS", findingLocation: "Recherche de votre position…", chooseRide: "Choisissez votre course", economy: "Économique", economyDetail: "Des trajets quotidiens abordables", selected: "Sélectionné", promoCode: "Code promotionnel", optional: "Facultatif", scheduleLater: "Planifier pour plus tard", saveHome: "Enregistrer le départ comme domicile", saveWork: "Enregistrer la destination comme travail", cash: "Espèces", confirmRide: "Confirmer la course", requesting: "Demande en cours…", activeRideExists: "Une course est déjà active", estimatedTrip: "Estimation du trajet", fare: "Tarif", distance: "Distance", tripDuration: "Durée du trajet", rideType: "Type de course", currentRide: "Course actuelle", sosEmergency: "Urgence SOS", cancelRide: "Annuler cette course", recentRides: "Vos courses récentes", notifications: "Notifications", receipt: "Reçu de course", downloadPdf: "Télécharger le PDF", savedPlaces: "Lieux enregistrés", useAsPickup: "Utiliser comme départ", useAsDestination: "Utiliser comme destination", noSavedPlaces: "Enregistrez votre domicile ou travail pour le réutiliser ici.", limitedOffer: "Offre à durée limitée", offRide: "de réduction sur votre course", expires: "Expire le", applied: "Appliqué", apply: "Appliquer", referralWallet: "Portefeuille de parrainage", inviteEarn: "Invitez des amis et gagnez", availableBalance: "Solde disponible", referralExplanation: "Gagnez 2 % du tarif de la première course terminée de votre filleul. La récompense est créditée lorsque la course est admissible.", yourReferralCode: "Votre code de parrainage", signInCode: "Connectez-vous pour voir votre code", copied: "Copié", copyCode: "Copier le code", totalReferrals: "Total des parrainages", rewardsEarned: "Récompenses gagnées", totalRewards: "Total des récompenses", rewardActivity: "Activité des récompenses", friendReferral: "Parrainage d'un ami", pending: "En attente", closeReceipt: "Fermer le reçu", rideChat: "Discussion de la course", chatMessage: "Message", send: "Envoyer", deliveryService: "Service de livraison", sendParcel: "Envoyer un colis", requestSampleRoute: "Demander un trajet d'essai", deliveryExplanation: "Les tarifs de livraison et la répartition 86/14 sont calculés par l'API. Les coordonnées du destinataire ne sont visibles que par les participants autorisés.", route: "Trajet", status: "Statut", monthlyPasses: "Forfaits mensuels", rideCredits: "Vos crédits de course", ridesRemaining: "courses restantes", noActivePass: "Aucun forfait actif. L'achat reste indisponible jusqu'à la certification du paiement en environnement d'essai.", noNotifications: "Aucune nouvelle notification."
    ,emergencyAssistance: "Assistance d'urgence", sendSosAlert: "Envoyer une alerte SOS ?", emergencyType: "Type d'urgence", securityThreat: "Menace pour la sécurité", medicalEmergency: "Urgence médicale", crashCollision: "Accident ou collision", harassment: "Harcèlement", otherEmergency: "Autre urgence", details: "Détails", responderInfo: "Ajoutez des informations utiles aux intervenants", sendingSos: "Envoi du SOS…", sendSosNow: "Envoyer le SOS", goBack: "Retour", cancellation: "Annulation", cancelQuestion: "Annuler cette course ?", reason: "Motif", plansChanged: "Changement de programme", driverTooLong: "Le chauffeur met trop de temps", pickupIncorrect: "Le lieu de départ est incorrect", bookedMistake: "Réservation par erreur", safetyConcern: "Problème de sécurité", other: "Autre", cancelling: "Annulation…", confirmCancellation: "Confirmer l'annulation", keepRide: "Garder ma course", unreadNotifications: "notifications non lues", rating: "Note", view: "Voir", signInHistory: "Connectez-vous pour voir vos réservations et reçus.", boarded: "Je suis à bord", share: "Partager", cancel: "Annuler"
    ,completionPending: "Heure de fin en attente", to: "vers", baseFare: "Tarif de base", demandAdjustment: "Ajustement de la demande", waitingFee: "Frais d'attente", tolls: "Péages", subtotal: "Sous-total", discount: "Réduction", totalPaid: "Total payé", refunded: "Remboursé", driver: "Chauffeur", notAssigned: "Non assigné", fareAllocation: "Répartition du tarif", platform: "Plateforme", ratings: "notes", newDriver: "Nouveau chauffeur · aucune note", vehiclePending: "Détails du véhicule en attente", platePending: "Plaque en attente", matchingDriver: "Nous recherchons le chauffeur vérifié disponible le plus proche.", confirmVehicle: "Confirmer que je suis dans le véhicule", paymentConfirmed: "Paiement confirmé.", cashPaymentHint: "Payez le chauffeur en espèces à la fin de la course.", electronicPaymentHint: "La confirmation du paiement électronique est requise avant la fin de la course."
    ,emergencyExplanation: "Cette alerte prévient les opérateurs de sécurité LibSwiftRide et enregistre l'incident pour cette course. En cas de danger immédiat, contactez les services d'urgence locaux dès que possible.", emergencyGpsHint: "Nous demanderons votre position GPS actuelle. Si l'autorisation est indisponible, l'alerte sera tout de même envoyée sans coordonnées.", cancelExplanation: "La course prendra fin immédiatement et le chauffeur assigné sera averti. Des frais d'annulation peuvent s'appliquer lorsque les règles tarifaires de production sont activées.", paymentLabel: "Paiement", allocationDriver: "Chauffeur", allocationPlatform: "Plateforme"
  }
} as const satisfies Record<SupportedLocale, Record<string, string>>;
export const passengerMessage = (locale: SupportedLocale, key: keyof typeof passengerMessages.en) => passengerMessages[locale][key];
export const rideStatusLabel = (status: string, locale: SupportedLocale) => {
  const labels: Record<SupportedLocale, Record<string, string>> = {
    en: { REQUESTED: "Requested", SEARCHING: "Finding a driver", DRIVER_ASSIGNED: "Driver assigned", DRIVER_ARRIVING: "Driver arriving", DRIVER_ARRIVED: "Driver arrived", PASSENGER_BOARDED: "Passenger boarded", IN_PROGRESS: "Trip in progress", COMPLETED: "Completed", CANCELLED: "Cancelled" },
    fr: { REQUESTED: "Demandée", SEARCHING: "Recherche d’un chauffeur", DRIVER_ASSIGNED: "Chauffeur assigné", DRIVER_ARRIVING: "Chauffeur en route", DRIVER_ARRIVED: "Chauffeur arrivé", PASSENGER_BOARDED: "Passager à bord", IN_PROGRESS: "Course en cours", COMPLETED: "Terminée", CANCELLED: "Annulée" }
  };
  return labels[locale][status] ?? status.replaceAll("_", " ");
};
export const money = (minor: number, currency = "LRD", locale: SupportedLocale = "en") =>
  new Intl.NumberFormat(locale === "fr" ? "fr-LR" : "en-LR", { style: "currency", currency }).format(minor / 100);
