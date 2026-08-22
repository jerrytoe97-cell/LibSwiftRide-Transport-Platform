import { describe, expect, it } from "vitest";
import { referralRewardFor } from "./referrals.js";

describe("referrals", () => {
  it("rewards only the first completed ride", () => {
    expect(referralRewardFor(1, 10_000)).toBe(200);
    expect(referralRewardFor(2, 10_000)).toBe(0);
    expect(referralRewardFor(1, 10_003)).toBe(200);
  });
});
