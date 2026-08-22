import { describe, expect, it } from "vitest";
import { createReceiptPdf } from "./receipt-pdf.js";

describe("receipt PDF", () => {
  it("creates a valid PDF envelope and escapes content", () => {
    const pdf = createReceiptPdf(["LibSwiftRide", "Ride (test)"]);
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString()).toContain("Ride \\(test\\)");
    expect(pdf.toString()).toContain("%%EOF");
  });
});
