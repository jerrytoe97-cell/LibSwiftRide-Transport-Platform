// Deliberate allow-lists: ORM relation additions must not expand public responses.
export function publicDriver(driver: any) {
  if (!driver) return null;
  const user = driver.user;
  const vehicle = driver.vehicle;
  return {
    id: driver.id, userId: driver.userId, status: driver.status,
    user: user ? { id: user.id, firstName: user.firstName, lastName: user.lastName, phone: user.phone } : undefined,
    vehicle: vehicle ? { id: vehicle.id, make: vehicle.make, model: vehicle.model, color: vehicle.color, year: vehicle.year, plateNumber: vehicle.plateNumber, active: vehicle.active } : null
  };
}

export function publicRide(ride: any) {
  const payment = ride.payment;
  return { ...ride, driver: publicDriver(ride.driver), payment: payment ? {
    id: payment.id, method: payment.method, status: payment.status,
    amountMinor: payment.amountMinor, currency: payment.currency, capturedAt: payment.capturedAt
  } : null };
}
