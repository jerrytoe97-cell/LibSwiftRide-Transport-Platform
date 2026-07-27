import { describe, expect, it } from "vitest";
import { REFERRAL_REWARD_MINOR, referralRewardFor } from "./referrals.js";

describe("referrals", () => {
  it("rewards only the first completed ride", () => {
    expect(referralRewardFor(1)).toBe(REFERRAL_REWARD_MINOR);
    expect(referralRewardFor(2)).toBe(0);
  });
});
