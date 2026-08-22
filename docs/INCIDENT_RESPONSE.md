# Incident response

## Purpose and severity

This runbook covers safety, security, privacy, availability and financial incidents. The incident commander owns coordination; the operations lead owns customer safety; engineering owns containment and recovery; finance owns payment reconciliation; and communications owns approved notices.

| Severity | Examples | Initial response |
| --- | --- | --- |
| SEV-1 | Active safety threat, confirmed breach, widespread outage, incorrect settlements | Page immediately; commander assigned within 15 minutes |
| SEV-2 | Material service degradation, provider outage, dispatch or notification backlog | Respond within 30 minutes |
| SEV-3 | Limited defect with a safe workaround | Triage during the operating day |

## Response

1. Open a restricted incident record with UTC timestamps, commander, severity and affected services. Do not copy credentials, government IDs, payment details or precise GPS history into chat or tickets.
2. Protect people first. Contact local emergency services through the approved safety playbook when there is an immediate threat; do not expose passenger or driver locations beyond authorized responders.
3. Contain the incident. Disable affected integrations, revoke credentials or sessions, isolate workloads, and preserve immutable audit and provider evidence.
4. Assess scope using request IDs, audit events, deployment versions, payment references and aggregate GPS freshness. Restrict sensitive queries to approved personnel.
5. Recover from a known artifact. Restore PostgreSQL only under the backup runbook and two-person approval. Redis presence data must be rebuilt, not treated as current after restore.
6. Validate authentication, authorization, booking, matching, trip state, 86/14 allocation, first-ride referral rewards, payments and notifications before reopening traffic.
7. Communicate on a fixed cadence. Legal and privacy owners approve regulator, provider and customer notifications.

## Financial and provider incidents

Set `PAYMENTS_ENABLED=false` to stop new Orange Money, MTN MoMo and Stripe attempts while preserving cash operations. Never manufacture a successful provider status. Reconcile provider references, signed webhooks, rides and wallet transactions before retrying or refunding. Privileged adjustments require an append-only audit event and finance approval.

## Security and privacy incidents

Rotate exposed secrets, revoke refresh sessions, preserve access logs, and identify all accessed records. Precise location and KYC evidence receive restricted handling. Follow applicable Liberian notification advice from counsel; the repository does not encode a legal deadline.

## Closure

Record customer impact, timeline, root cause, actual RPO/RTO, financial reconciliation, corrective owners and due dates. Hold a blameless review within five business days for SEV-1/2 events. Test this runbook twice yearly and after material architecture or provider changes.
