export const REFERRAL_REWARD_BPS = 200;

export function referralRewardFor(completedRides: number, fareMinor: number) {
  if (!Number.isSafeInteger(completedRides) || completedRides < 0) throw new Error("Invalid completed ride count");
  if (!Number.isSafeInteger(fareMinor) || fareMinor < 0) throw new Error("Invalid fare");
  return completedRides === 1 ? Math.round((fareMinor * REFERRAL_REWARD_BPS) / 10_000) : 0;
}
