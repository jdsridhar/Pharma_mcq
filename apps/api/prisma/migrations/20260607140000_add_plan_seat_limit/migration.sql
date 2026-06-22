-- Multi-tenancy: institutional seat-based billing.
-- plans.seatLimit: null = Individual (per-user) plan; positive = Institutional plan that caps the
-- owning organization's member count. Index subscriptions.organizationId for org-subscription lookups.

ALTER TABLE "plans" ADD COLUMN "seatLimit" INTEGER;

CREATE INDEX "subscriptions_organizationId_idx" ON "subscriptions"("organizationId");
