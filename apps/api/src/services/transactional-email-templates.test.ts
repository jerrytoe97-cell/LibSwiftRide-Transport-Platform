import { describe, expect, it } from "vitest";
import { renderTransactionalEmailHtml, transactionalEmailContent, type TransactionalTemplateInput } from "./transactional-email-templates.js";

const cases: Array<{ input: TransactionalTemplateInput; expected: string }> = [
  { input: { template: "password-reset", token: "fictional-reset-token" }, expected: "expires in one hour" },
  { input: { template: "account-security-alert", event: "Your password changed." }, expected: "contact LibSwiftRide Support" },
  { input: { template: "driver-application-received" }, expected: "awaiting secure review" },
  { input: { template: "kyc-approved" }, expected: "has been approved" },
  { input: { template: "kyc-rejected", reason: "Fictional document is unclear." }, expected: "Fictional document is unclear" },
  { input: { template: "driver-activated" }, expected: "driver account is active" },
  { input: { template: "ride-booking-confirmation", rideReference: "LSR-TEST1234", pickup: "Test Pickup", destination: "Test Destination" }, expected: "LSR-TEST1234" },
  { input: { template: "ride-cancelled", rideReference: "LSR-TEST1234", reason: "Fictional test cancellation" }, expected: "Fictional test cancellation" },
  { input: { template: "dispatch-assignment", rideReference: "LSR-TEST1234", pickup: "Test Pickup" }, expected: "Open the Driver app" },
  { input: { template: "fleet-document-expiry", documentName: "DRIVER LICENSE", expiryDate: "2026-09-30" }, expected: "2026-09-30" }
];

describe("transactional email templates", () => {
  it.each(cases)("renders $input.template", ({ input, expected }) => {
    const content = transactionalEmailContent(input);
    expect(content.template).toBe(input.template);
    expect(content.title.length).toBeGreaterThan(10);
    expect(content.body).toContain(expected);
  });

  it("escapes user-controlled content in HTML while preserving plain text", () => {
    const content = transactionalEmailContent({ template: "ride-cancelled", rideReference: "LSR-TEST", reason: "<script>alert('x')</script>" });
    const html = renderTransactionalEmailHtml(content.title, content.body);
    expect(content.body).toContain("<script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
