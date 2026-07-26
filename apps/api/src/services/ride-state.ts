export const rideTransitions = {
  REQUESTED: ["SEARCHING", "CANCELLED"],
  SEARCHING: ["DRIVER_ASSIGNED", "CANCELLED"],
  DRIVER_ASSIGNED: ["DRIVER_ARRIVING", "SEARCHING", "CANCELLED"],
  DRIVER_ARRIVING: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["PASSENGER_BOARDED", "CANCELLED"],
  PASSENGER_BOARDED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
} as const;

export type RideState = keyof typeof rideTransitions;

export function canTransition(from: RideState, to: RideState) {
  return (rideTransitions[from] as readonly string[]).includes(to);
}

export function assertTransition(from: RideState, to: RideState) {
  if (!canTransition(from, to)) throw new Error(`Invalid ride transition: ${from} -> ${to}`);
}
