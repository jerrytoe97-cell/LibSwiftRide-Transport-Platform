export const REFERRAL_REWARD_MINOR = 50_000;

export function referralRewardFor(completedRides: number) {
  if (!Number.isSafeInteger(completedRides) || completedRides < 0) throw new Error("Invalid completed ride count");
  return completedRides === 1 ? REFERRAL_REWARD_MINOR : 0;
}
