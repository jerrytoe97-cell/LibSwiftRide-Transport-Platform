import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("./dispatch.ts", import.meta.url), "utf8");
const reminders = readFileSync(new URL("./document-reminders.ts", import.meta.url), "utf8");

describe("transactional notification path inventory", () => {
  it.each([
    ["password reset", routes, 'template: "password-reset"'],
    ["account security alert", routes, 'template: "account-security-alert"'],
    ["driver application received", routes, 'template: "driver-application-received"'],
    ["KYC approval", routes, 'template: "kyc-approved"'],
    ["KYC rejection", routes, 'template: "kyc-rejected"'],
    ["driver activation", routes, 'template: "driver-activated"'],
    ["ride booking confirmation", routes, 'template: "ride-booking-confirmation"'],
    ["ride cancellation", routes, 'template: "ride-cancelled"'],
    ["dispatch assignment", dispatch, 'template: "dispatch-assignment"'],
    ["fleet document expiry", reminders, 'template: "fleet-document-expiry"']
  ])("keeps the %s producer connected", (_name, source, marker) => {
    expect(source).toContain(marker);
  });

  it("does not introduce SMTP or Zoho credentials into the application transport", () => {
    const productionSources = `${routes}\n${dispatch}\n${reminders}`.toLowerCase();
    expect(productionSources).not.toContain("smtp");
    expect(productionSources).not.toContain("zoho");
  });
});
