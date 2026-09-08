import { type Prisma } from "@prisma/client";
import { prisma } from "../lib.js";

export class SafetyOperationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

type Actor = { actorId: string; ipAddress?: string };

// All responder mutations lock the incident first, so concurrent retries cannot
// duplicate audit events or queued escalation notifications.
async function withIncident<T>(id: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SafetyIncident" WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new SafetyOperationError(404, "INCIDENT_NOT_FOUND", "Safety incident not found");
    return operation(tx);
  });
}

export function updateSafetyIncident(id: string, status: "ACKNOWLEDGED" | "RESOLVED", actor: Actor) {
  return withIncident(id, async (tx) => {
    const incident = await tx.safetyIncident.findUniqueOrThrow({ where: { id } });
    if (incident.status === status) return incident;
    if (incident.status === "RESOLVED" || (status === "RESOLVED" && incident.status !== "ACKNOWLEDGED")) {
      throw new SafetyOperationError(409, "INCIDENT_TRANSITION", "Acknowledge an open incident before resolving it; resolved incidents cannot reopen");
    }
    const updated = await tx.safetyIncident.update({ where: { id }, data: status === "ACKNOWLEDGED"
      ? { status, acknowledgedBy: actor.actorId, acknowledgedAt: new Date() }
      : { status, resolvedBy: actor.actorId, resolvedAt: new Date() } });
    await tx.auditLog.create({ data: { ...actor, action: `SOS_${status}`, entityType: "SafetyIncident", entityId: id } });
    return updated;
  });
}

export function escalateSafetyIncident(id: string, actor: Actor) {
  return withIncident(id, async (tx) => {
    const incident = await tx.safetyIncident.findUniqueOrThrow({ where: { id } });
    if (incident.status === "RESOLVED") throw new SafetyOperationError(409, "INCIDENT_RESOLVED", "Resolved incidents cannot be escalated");
    const existing = await tx.rideEvent.findFirst({ where: { rideId: incident.rideId, type: "SOS_ESCALATED", metadata: { path: ["incidentId"], equals: id } } });
    if (existing) return { id: existing.id, queuedAt: existing.createdAt, alreadyQueued: true };
    const responders = await tx.user.findMany({ where: { role: { in: ["ADMIN", "SUPPORT"] }, status: "ACTIVE", id: { not: actor.actorId } }, select: { id: true } });
    if (!responders.length) throw new SafetyOperationError(409, "NO_RESPONDERS", "No other active administrator or support responder is available for escalation");
    const event = await tx.rideEvent.create({ data: { rideId: incident.rideId, type: "SOS_ESCALATED", actorId: actor.actorId, metadata: { incidentId: id } } });
    await tx.notification.createMany({ data: responders.flatMap((user) => (["IN_APP", "PUSH"] as const).map((channel) => ({
      userId: user.id, channel, template: "sos", title: "Safety incident escalated",
      body: "An unresolved ride safety incident requires urgent review.", data: { incidentId: id, rideId: incident.rideId, url: "/" }
    }))) });
    await tx.auditLog.create({ data: { ...actor, action: "SOS_ESCALATED", entityType: "SafetyIncident", entityId: id, metadata: { eventId: event.id, responderCount: responders.length } } });
    return { id: event.id, queuedAt: event.createdAt, alreadyQueued: false };
  });
}

export function safetyContact(id: string, target: "driver" | "passenger", actor: Actor) {
  return withIncident(id, async (tx) => {
    const incident = await tx.safetyIncident.findUniqueOrThrow({ where: { id }, select: { ride: { select: {
      passenger: { select: { firstName: true, lastName: true, phone: true } },
      driver: { select: { user: { select: { firstName: true, lastName: true, phone: true } } } }
    } } } });
    const contact = target === "driver" ? incident.ride.driver?.user : incident.ride.passenger;
    if (!contact) throw new SafetyOperationError(404, "CONTACT_NOT_FOUND", "No driver is assigned to this ride");
    await tx.auditLog.create({ data: { ...actor, action: "SOS_CONTACT_VIEWED", entityType: "SafetyIncident", entityId: id, metadata: { target } } });
    return contact;
  });
}
