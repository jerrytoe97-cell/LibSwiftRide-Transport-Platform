export type TransactionalTemplateInput =
  | { template: "password-reset"; token: string }
  | { template: "account-security-alert"; event: string }
  | { template: "driver-application-received" }
  | { template: "kyc-approved" }
  | { template: "kyc-rejected"; reason?: string }
  | { template: "driver-activated" }
  | { template: "ride-booking-confirmation"; rideReference: string; pickup: string; destination: string; scheduledFor?: string }
  | { template: "ride-cancelled"; rideReference: string; reason: string }
  | { template: "dispatch-assignment"; rideReference: string; pickup: string }
  | { template: "fleet-document-expiry"; documentName: string; expiryDate: string };

export type TransactionalContent = { template: TransactionalTemplateInput["template"]; title: string; body: string };

export function transactionalEmailContent(input: TransactionalTemplateInput): TransactionalContent {
  switch (input.template) {
    case "password-reset":
      return { template: input.template, title: "Reset your LibSwiftRide password", body: `We received a request to reset your LibSwiftRide password.\n\nOne-time reset token:\n${input.token}\n\nThis token expires in one hour and can be used only once. If you did not request this, no action is required. Never share this token with anyone.` };
    case "account-security-alert":
      return { template: input.template, title: "LibSwiftRide account security alert", body: `${input.event}\n\nIf you did not perform this action, contact LibSwiftRide Support immediately and secure your account.` };
    case "driver-application-received":
      return { template: input.template, title: "We received your driver application", body: "Your fictional staging documents were received and are awaiting secure review. We will notify you after an authorized administrator makes a decision." };
    case "kyc-approved":
      return { template: input.template, title: "Your driver verification was approved", body: "Your LibSwiftRide driver verification has been approved. Complete any remaining vehicle requirements before going online." };
    case "kyc-rejected":
      return { template: input.template, title: "Action required on your driver application", body: `Your driver verification needs changes before it can be approved.${input.reason ? `\n\nReview note: ${input.reason}` : ""}\n\nOpen the Driver portal, correct the requested fictional staging documents, and submit again.` };
    case "driver-activated":
      return { template: input.template, title: "Your LibSwiftRide driver account is active", body: "Your driver account is active. Confirm your vehicle, location permission, and availability settings in the Driver portal before accepting a ride." };
    case "ride-booking-confirmation":
      return { template: input.template, title: "Your LibSwiftRide booking is confirmed", body: `Ride reference: ${input.rideReference}\nPickup: ${input.pickup}\nDestination: ${input.destination}${input.scheduledFor ? `\nScheduled for: ${input.scheduledFor}` : "\nWe are finding an available driver now."}\n\nOpen the Passenger app for live status updates.` };
    case "ride-cancelled":
      return { template: input.template, title: "Your LibSwiftRide ride was cancelled", body: `Ride reference: ${input.rideReference}\nReason: ${input.reason}\n\nOpen the Passenger app if you would like to request another ride or contact Support.` };
    case "dispatch-assignment":
      return { template: input.template, title: "New LibSwiftRide dispatch assignment", body: `Ride reference: ${input.rideReference}\nPickup: ${input.pickup}\n\nOpen the Driver app promptly to review and accept this assignment. Do not drive while using your phone.` };
    case "fleet-document-expiry":
      return { template: input.template, title: "Driver document expiry reminder", body: `${input.documentName} expires on ${input.expiryDate}. Upload a renewed fictional staging document before expiry to avoid interruption to driver eligibility.` };
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderTransactionalEmailHtml(title: string, body: string) {
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 16px;color:#344866;line-height:1.6">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f8fc;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fc;padding:24px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dce3ee;border-radius:16px"><tr><td style="padding:24px;background:#0c2454;color:#ffffff;border-radius:16px 16px 0 0"><strong style="font-size:22px">LibSwift<span style="color:#ff8d86">Ride</span></strong></td></tr><tr><td style="padding:28px"><h1 style="margin:0 0 20px;color:#0c2454;font-size:26px;line-height:1.25">${escapeHtml(title)}</h1>${paragraphs}<p style="margin:24px 0 0;color:#647188;font-size:13px;line-height:1.5">LibSwiftRide Support<br>Monrovia, Liberia</p></td></tr></table></td></tr></table></body></html>`;
}
