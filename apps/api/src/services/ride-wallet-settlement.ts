import type { PaymentMethod } from "@prisma/client";

// Cash is already held by the driver. Only the platform's share is owed back;
// electronic fares held by the platform create a payable to the driver instead.
export function rideWalletSettlement(method: PaymentMethod, fareMinor: number, earningsMinor: number) {
  if (!Number.isSafeInteger(fareMinor) || !Number.isSafeInteger(earningsMinor) || fareMinor < 0 || earningsMinor < 0 || earningsMinor > fareMinor) throw new Error("Invalid ride settlement amounts");
  return method === "CASH"
    ? { deltaMinor: -(fareMinor - earningsMinor), amountMinor: fareMinor - earningsMinor, type: "DEBIT" as const, description: "Company commission owed on cash collected by driver" }
    : { deltaMinor: earningsMinor, amountMinor: earningsMinor, type: "CREDIT" as const, description: "Driver ride earnings" };
}
