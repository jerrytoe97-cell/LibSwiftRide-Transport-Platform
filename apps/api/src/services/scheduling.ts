export function validateRideSchedule(scheduledFor: Date, now = new Date()) {
  const delay = scheduledFor.getTime() - now.getTime();
  return delay >= 15 * 60_000 && delay <= 30 * 86_400_000;
}

export function validateAvailabilityWindow(startsAt: Date, endsAt: Date, now = new Date()) {
  return startsAt.getTime() >= now.getTime() - 60_000
    && endsAt > startsAt
    && endsAt.getTime() - startsAt.getTime() <= 24 * 60 * 60_000;
}
