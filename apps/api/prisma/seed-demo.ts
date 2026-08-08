import argon2 from "argon2";
import { PrismaClient, type UserRole, type RideStatus } from "@prisma/client";

if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
  throw new Error("The demo seed requires DEMO_MODE=true and is forbidden in production.");
}

const prisma = new PrismaClient();
const passwordHash = await argon2.hash("LibSwiftRide-Demo-2026!");
const now = new Date();
const day = 86_400_000;
const demoId = (group: number, index = 0) => `00000000-0000-4000-${String(8000+group).padStart(4,"0")}-${String(index).padStart(12,"0")}`;
const names = [
  ["Miatta","Kamara"],["Samuel","Toe"],["Hawa","Johnson"],["Emmanuel","Kollie"],["Martha","Sackie"],
  ["Joseph","Tamba"],["Fatu","Sheriff"],["Abraham","Kromah"],["Comfort","Dolo"],["Prince","Wreh"],
  ["Tenneh","Dukuly"],["James","Kpadeh"],["Esther","Gaye"],["Daniel","Mulbah"],["Mercy","Konneh"],
  ["Patrick","Zubah"],["Mamie","Cooper"],["Ibrahim","Sesay"],["Victoria","Dennis"],["Augustine","Nyema"],
  ["Rebecca","Cole"],["George","Freeman"],["Lorpu","Kerkulah"],["Anthony","Lahai"],["Sarah","Quaye"],
];
const locations = [
  ["ELWA Junction, Paynesville",6.2647,-10.7031],["Broad Street, Monrovia",6.3156,-10.8074],
  ["Red Light Market, Paynesville",6.2901,-10.7057],["Tubman Boulevard, Sinkor",6.2871,-10.7739],
  ["Spriggs Payne Airport",6.2891,-10.7587],["Duala Market",6.3630,-10.7950],
  ["SKD Sports Complex",6.3058,-10.7492],["Mamba Point, Monrovia",6.3264,-10.8060],
] as const;

async function upsertUser(phone: string, email: string, firstName: string, lastName: string, role: UserRole) {
  const user = await prisma.user.upsert({
    where: { phone },
    update: { email, firstName, lastName, role, status: "ACTIVE", emailVerifiedAt: now, passwordHash, locale: "en" },
    create: { phone, email, firstName, lastName, role, status: "ACTIVE", emailVerifiedAt: now, passwordHash, locale: "en", referralCode: `DEMO-${role}-${phone.slice(-4)}` },
  });
  const balanceMinor = role === "DRIVER" ? 286_400 : 75_000;
  const wallet = await prisma.wallet.upsert({ where: { userId: user.id }, update: { balanceMinor, currency: "LRD" }, create: { userId: user.id, balanceMinor, currency: "LRD" } });
  await prisma.walletTransaction.upsert({
    where: { reference: `demo-opening-${user.id}` },
    update: { amountMinor: balanceMinor, balanceMinor, createdAt: now },
    create: { walletId: wallet.id, type: "ADJUSTMENT", amountMinor: balanceMinor, balanceMinor, reference: `demo-opening-${user.id}`, idempotencyKey: `demo-opening-${user.id}`, description: "Fictional opening balance for local demonstration", metadata: { demo: true }, createdAt: now },
  });
  return user;
}

const primary = {
  passenger: await upsertUser("+231000000001","passenger.demo@example.com","Miatta","Kamara","PASSENGER"),
  driver: await upsertUser("+231000000002","driver.demo@example.com","Samuel","Toe","DRIVER"),
  admin: await upsertUser("+231000000003","admin.demo@example.com","Hawa","Johnson","ADMIN"),
  dispatcher: await upsertUser("+231000000004","dispatcher.demo@example.com","Emmanuel","Kollie","DISPATCHER"),
  fleet: await upsertUser("+231000000005","fleet.demo@example.com","Martha","Sackie","FLEET_MANAGER"),
  business: await upsertUser("+231000000006","business.demo@example.com","Joseph","Tamba","BUSINESS_MANAGER"),
};

const passengers = [primary.passenger];
for (let index = 1; index < 25; index++) {
  const [firstName,lastName] = names[index];
  passengers.push(await upsertUser(`+23110000${String(index).padStart(4,"0")}`,`passenger${index}@demo.example.com`,firstName,lastName,"PASSENGER"));
}

const fleetManagers = [primary.fleet];
for (let index = 1; index < 3; index++) {
  fleetManagers.push(await upsertUser(`+23120000000${index}`,`fleet${index}@demo.example.com`,names[index+10][0],names[index+10][1],"FLEET_MANAGER"));
}
const fleets = [];
for (let index = 0; index < fleetManagers.length; index++) {
  fleets.push(await prisma.fleet.upsert({
    where: { managerId: fleetManagers[index].id },
    update: { name: ["Monrovia Green Fleet","Paynesville Mobility","Coastal City Cars"][index] },
    create: { managerId: fleetManagers[index].id, name: ["Monrovia Green Fleet","Paynesville Mobility","Coastal City Cars"][index] },
  }));
}

const drivers = [];
for (let index = 0; index < 15; index++) {
  const user = index === 0 ? primary.driver : await upsertUser(`+23130000${String(index).padStart(4,"0")}`,`driver${index}@demo.example.com`,names[(index+5)%names.length][0],names[(index+5)%names.length][1],"DRIVER");
  const driver = await prisma.driver.upsert({
    where: { userId: user.id },
    update: { fleetId: fleets[index%3].id, status: index < 10 ? "AVAILABLE" : index < 13 ? "OFFLINE" : "ON_TRIP", verifiedAt: now, onboardingStep: "APPROVED" },
    create: { userId: user.id, fleetId: fleets[index%3].id, status: index < 10 ? "AVAILABLE" : index < 13 ? "OFFLINE" : "ON_TRIP", licenseNumber: `DEMO-LIC-${String(index+1).padStart(3,"0")}`, verifiedAt: now, onboardingStep: "APPROVED" },
  });
  drivers.push({ ...driver, user });
  await prisma.kycCase.upsert({
    where: { driverId: driver.id },
    update: { status: index === 14 ? "UNDER_REVIEW" : "APPROVED", submittedAt: new Date(now.getTime()-30*day), reviewedAt: index === 14 ? null : new Date(now.getTime()-25*day), reviewerId: index === 14 ? null : primary.admin.id },
    create: { driverId: driver.id, status: index === 14 ? "UNDER_REVIEW" : "APPROVED", submittedAt: new Date(now.getTime()-30*day), reviewedAt: index === 14 ? null : new Date(now.getTime()-25*day), reviewerId: index === 14 ? null : primary.admin.id },
  });
}

for (let index = 0; index < 8; index++) {
  await prisma.vehicle.upsert({
    where: { plateNumber: `DEMO-${String(index+1).padStart(3,"0")}` },
    update: { driverId: drivers[index].id, fleetId: fleets[index%3].id, active: true, insuranceExpiresAt: new Date(now.getTime()+(index+1)*14*day) },
    create: { plateNumber: `DEMO-${String(index+1).padStart(3,"0")}`, make: index%2 ? "Nissan" : "Toyota", model: index%2 ? "Sentra" : "Corolla", year: 2020+index%4, color: ["Silver","White","Blue","Black"][index%4], driverId: drivers[index].id, fleetId: fleets[index%3].id, active: true, insuranceExpiresAt: new Date(now.getTime()+(index+1)*14*day), inspectionExpiresAt: new Date(now.getTime()+(index+2)*18*day), registrationExpiresAt: new Date(now.getTime()+(index+3)*20*day) },
  });
}

const businessManagers = [primary.business, await upsertUser("+231400000002","business2@demo.example.com","Victoria","Dennis","BUSINESS_MANAGER")];
const accounts = [];
for (let index = 0; index < 2; index++) {
  accounts.push(await prisma.corporateAccount.upsert({
    where: { managerId: businessManagers[index].id },
    update: { name: index ? "Mesurado Trading Group" : "Liberia Demo Services", monthlyBudgetMinor: index ? 8_000_000 : 5_000_000, active: true },
    create: { managerId: businessManagers[index].id, name: index ? "Mesurado Trading Group" : "Liberia Demo Services", billingEmail: `billing${index+1}@demo.example.com`, monthlyBudgetMinor: index ? 8_000_000 : 5_000_000, active: true },
  }));
}
for (let index = 0; index < 20; index++) {
  await prisma.corporateEmployee.upsert({
    where: { userId: passengers[index+2].id },
    update: { accountId: accounts[index%2].id, monthlyLimitMinor: 350_000+(index%4)*100_000, active: index !== 19 },
    create: { userId: passengers[index+2].id, accountId: accounts[index%2].id, monthlyLimitMinor: 350_000+(index%4)*100_000, active: index !== 19 },
  });
}

const campaign = await prisma.couponCampaign.upsert({ where: { id: demoId(1) }, update: {}, create: { id: demoId(1), name: "Move Monrovia", budgetMinor: 2_000_000, spentMinor: 236_000, startsAt: new Date(now.getTime()-15*day), endsAt: new Date(now.getTime()+60*day) } });
for (const [code,percent] of [["WELCOME25",25],["MONROVIA10",10],["BUSINESS15",15]] as const) {
  await prisma.promoCode.upsert({ where: { code }, update: { active: true }, create: { code, description: `${percent}% off demo rides`, percentageOff: percent, maxDiscountMinor: 30_000, startsAt: new Date(now.getTime()-10*day), expiresAt: new Date(now.getTime()+90*day), maxUses: 500, campaignId: campaign.id } });
}

const statuses: RideStatus[] = ["COMPLETED","COMPLETED","COMPLETED","COMPLETED","CANCELLED","DRIVER_ASSIGNED","DRIVER_ARRIVING","DRIVER_ARRIVED","IN_PROGRESS","REQUESTED","SEARCHING"];
const rides = [];
for (let index = 0; index < 48; index++) {
  const status = statuses[index%statuses.length];
  const pickup = locations[index%locations.length];
  const destination = locations[(index+3)%locations.length];
  const fareMinor = 68_000+(index%8)*11_000;
  const companyCommissionMinor = Math.round(fareMinor * .14);
  const driverEarningsMinor = fareMinor - companyCommissionMinor;
  const requestedAt = new Date(now.getTime()-(index%28)*day-(index%12)*3_600_000);
  const ride = await prisma.ride.upsert({
    where: { passengerId_idempotencyKey: { passengerId: passengers[index%passengers.length].id, idempotencyKey: `demo-ride-${String(index).padStart(3,"0")}` } },
    update: { status, baseFareMinor: fareMinor, fareMinor, driverEarningsMinor, companyCommissionMinor },
    create: {
      passengerId: passengers[index%passengers.length].id, driverId: drivers[index%drivers.length].id, status,
      pickupAddress: pickup[0], pickupLatitude: pickup[1], pickupLongitude: pickup[2],
      destinationAddress: destination[0], destinationLatitude: destination[1], destinationLongitude: destination[2],
      estimatedDistanceM: 5_000+(index%9)*1_100, estimatedDurationSec: 900+(index%8)*240,
      baseFareMinor: fareMinor, fareMinor, driverEarningsMinor, companyCommissionMinor,
      currency: index%11===0 ? "USD" : "LRD", paymentMethod: index%4===0 ? "MTN_MOMO" : index%4===1 ? "ORANGE_MONEY" : "CASH",
      discountMinor: index%7===0 ? 8_000 : 0, idempotencyKey: `demo-ride-${String(index).padStart(3,"0")}`, requestedAt,
      scheduledFor: index%10===0 ? new Date(now.getTime()+(index%3+1)*day) : null,
      acceptedAt: !["REQUESTED","SEARCHING"].includes(status) ? new Date(requestedAt.getTime()+180_000) : null,
      arrivedAt: ["DRIVER_ARRIVED","IN_PROGRESS","COMPLETED"].includes(status) ? new Date(requestedAt.getTime()+600_000) : null,
      boardedAt: ["IN_PROGRESS","COMPLETED"].includes(status) ? new Date(requestedAt.getTime()+720_000) : null,
      startedAt: ["IN_PROGRESS","COMPLETED"].includes(status) ? new Date(requestedAt.getTime()+780_000) : null,
      completedAt: status==="COMPLETED" ? new Date(requestedAt.getTime()+1_800_000) : null,
      cancelledAt: status==="CANCELLED" ? new Date(requestedAt.getTime()+300_000) : null,
      cancellationReason: status==="CANCELLED" ? "Passenger plans changed" : null,
    },
  });
  rides.push(ride);
}

// Repair the legacy fictional demo ride created by earlier seed versions.
await prisma.ride.updateMany({ where: { idempotencyKey: "demo-completed-001", fareMinor: 150_000 }, data: { companyCommissionMinor: 21_000, driverEarningsMinor: 129_000 } });

for (let index = 0; index < 12; index++) {
  const ride = rides[index];
  const payment = await prisma.payment.upsert({
    where: { rideId: ride.id }, update: {},
    create: { rideId: ride.id, provider: "manual-mobile-money-demo", providerRef: `DEMO-PAY-${index}`, idempotencyKey: `demo-payment-${index}`, amountMinor: ride.fareMinor, currency: ride.currency, method: index%2 ? "ORANGE_MONEY" : "MTN_MOMO", status: "CAPTURED", capturedAt: ride.completedAt ?? now, providerPayload: { environment: "demo", redacted: true } },
  });
  await prisma.manualPaymentConfirmation.upsert({ where: { paymentId: payment.id }, update: {}, create: { paymentId: payment.id, idempotencyKey: `demo-confirm-${index}`, providerReference: `MM-DEMO-${1000+index}`, evidenceReference: `demo-evidence-${index}`, confirmedById: primary.admin.id } });
}

for (let index = 0; index < 16; index++) {
  await prisma.rating.upsert({ where: { rideId_authorId: { rideId: rides[index].id, authorId: rides[index].passengerId } }, update: {}, create: { rideId: rides[index].id, authorId: rides[index].passengerId, subjectId: drivers[index%drivers.length].user.id, score: 4+index%2, comment: ["Safe and courteous trip.","Clean car and smooth ride.","Driver arrived on time."][index%3], status: index===15 ? "PENDING" : "PUBLISHED" } });
}
for (let index = 0; index < 5; index++) {
  await prisma.safetyIncident.upsert({ where: { id: demoId(2,index) }, update: {}, create: { id: demoId(2,index), rideId: rides[index+5].id, reporterId: rides[index+5].passengerId, status: index<2 ? "OPEN" : "RESOLVED", category: index%2 ? "LOST_ITEM" : "SAFETY_CHECK", note: "Fictional demonstration incident for operations review.", acknowledgedBy: index<2 ? null : primary.dispatcher.id, acknowledgedAt: index<2 ? null : now } });
}
for (let index = 0; index < 24; index++) {
  const userId = index%3===0 ? drivers[index%drivers.length].user.id : passengers[index%passengers.length].id;
  await prisma.notification.upsert({ where: { id: demoId(3,index) }, update: {}, create: { id: demoId(3,index), userId, channel: index%4===0 ? "PUSH" : "IN_APP", status: index%5===0 ? "READ" : "SENT", template: "demo-operations", title: ["Driver arriving","Ride receipt ready","Document expiry reminder","Promotion available"][index%4], body: "This is safe fictional content created for the local LibSwiftRide demonstration.", sentAt: now, readAt: index%5===0 ? now : null } });
}
for (let index = 0; index < 6; index++) {
  await prisma.chatMessage.upsert({ where: { id: demoId(4,index) }, update: {}, create: { id: demoId(4,index), rideId: rides[8].id, senderId: index%2 ? drivers[8%drivers.length].user.id : rides[8].passengerId, content: index%2 ? "I am approaching the pickup point." : "Thank you. I am waiting by the main entrance.", createdAt: new Date(now.getTime()-(6-index)*60_000) } });
}
await prisma.referral.upsert({ where: { referredUserId: passengers[1].id }, update: {}, create: { referrerId: primary.passenger.id, referredUserId: passengers[1].id, status: "REWARDED", rewardMinor: 20_000, qualifiedAt: new Date(now.getTime()-10*day), rewardedAt: new Date(now.getTime()-9*day) } });
for (let index = 0; index < 8; index++) {
  await prisma.auditLog.create({ data: { actorId: index%2 ? primary.admin.id : primary.dispatcher.id, action: index%2 ? "PAYMENT_VERIFIED" : "SUPPORT_CASE_REVIEWED", entityType: index%2 ? "Payment" : "SupportCase", entityId: `DEMO-${index}`, metadata: { demo: true, category: index%2 ? "manual-mobile-money" : "service-complaint" } } });
}
await prisma.commissionPolicy.create({ data: { driverShareBps: 8600, companyCommissionBps: 1400, effectiveAt: now, createdById: primary.admin.id, reason: "Demo confirmation of enforced production split" } }).catch(() => undefined);

console.log(JSON.stringify({ passengers:25, drivers:15, vehicles:8, fleets:3, businessAccounts:2, employees:20, rides:48, demoPassword:"LibSwiftRide-Demo-2026!", paymentsEnabled:false }));
await prisma.$disconnect();
