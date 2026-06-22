import { z } from 'zod';

/**
 * Commerce contracts. Money is integer minor units (`amountMinor`) + currency. Payments are
 * provider-agnostic (Razorpay first, §7-C); subscriptions grant plan features (entitlements).
 */

export const BILLING_INTERVALS = ['MONTHLY', 'QUARTERLY', 'YEARLY', 'LIFETIME'] as const;
export const billingIntervalSchema = z.enum(BILLING_INTERVALS);
export type BillingIntervalT = z.infer<typeof billingIntervalSchema>;

export const subscriptionStatusSchema = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
]);
export type SubscriptionStatusT = z.infer<typeof subscriptionStatusSchema>;

export const planCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9._-]{1,63}$/, 'Code must be 2–64 chars: A–Z, 0–9, dot, underscore, hyphen');

export const featureKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_.-]{1,63}$/, 'Feature key must be 2–64 chars: lowercase, digits, dot, underscore, hyphen');

export const currencySchema = z.string().trim().length(3).toUpperCase();

// ── Catalog ──
export const createPlanSchema = z.object({
  code: planCodeSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().default(true),
  /** Institutional plan: number of member seats granted. Omit for Individual (per-user) plans. */
  seatLimit: z.number().int().min(1).max(1_000_000).optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    /** Set a positive seat count to make this an Institutional plan, or null to make it Individual. */
    seatLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const createPlanPriceSchema = z.object({
  billingInterval: billingIntervalSchema,
  amountMinor: z.number().int().min(0).max(100_000_000),
  currency: currencySchema.default('INR'),
  isActive: z.boolean().default(true),
});
export type CreatePlanPriceInput = z.infer<typeof createPlanPriceSchema>;

export const updatePlanPriceSchema = z
  .object({
    amountMinor: z.number().int().min(0).max(100_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdatePlanPriceInput = z.infer<typeof updatePlanPriceSchema>;

export const createFeatureSchema = z.object({
  key: featureKeySchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
});
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>;

export const setPlanFeaturesSchema = z.object({
  items: z
    .array(z.object({ featureKey: featureKeySchema, limit: z.number().int().min(0).nullable().optional() }))
    .max(100),
});
export type SetPlanFeaturesInput = z.infer<typeof setPlanFeaturesSchema>;

// ── Subscription ──
export const subscribeSchema = z.object({ planPriceId: z.string().uuid() });
export type SubscribeInput = z.infer<typeof subscribeSchema>;

// ── Institutional (org) subscription — Super-Admin provisions seats for an institution ──
export const assignOrgSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  /** Optional price (drives the billing period). Omit for an open-ended provisioning. */
  planPriceId: z.string().uuid().optional(),
});
export type AssignOrgSubscriptionInput = z.infer<typeof assignOrgSubscriptionSchema>;

// ── Response DTOs ──
export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  /** Institutional plan: granted member seats. null = Individual (per-user) plan. */
  seatLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanPriceDto {
  id: string;
  planId: string;
  billingInterval: BillingIntervalT;
  amountMinor: number;
  currency: string;
  isActive: boolean;
}

export interface FeatureDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export interface PlanFeatureDto {
  key: string;
  name: string;
  limit: number | null;
}

export interface PlanDetailDto extends PlanDto {
  prices: PlanPriceDto[];
  features: PlanFeatureDto[];
}

export interface SubscriptionDto {
  id: string;
  planId: string;
  planPriceId: string | null;
  status: SubscriptionStatusT;
  provider: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

/** An institution's active seat subscription + live seat usage (Super-Admin / org-admin view). */
export interface OrgSubscriptionDto {
  organizationId: string;
  subscriptionId: string;
  planId: string;
  planCode: string;
  planName: string;
  status: SubscriptionStatusT;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  seatLimit: number | null;
  seatsUsed: number;
  /** seatLimit - seatsUsed (never negative); null when the plan has no seat cap. */
  seatsAvailable: number | null;
}

export interface CheckoutOrderDto {
  provider: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  keyId: string | null;
}

export interface CheckoutResultDto {
  status: 'ACTIVE' | 'PENDING';
  subscription: SubscriptionDto | null;
  order: CheckoutOrderDto;
}

export interface EntitlementsDto {
  plan: { code: string; name: string } | null;
  features: PlanFeatureDto[];
  /**
   * True when the user belongs to an institution that has an active institutional (seat) plan —
   * i.e. their access is managed by their institution, not bought individually. Note: simply
   * belonging to the single-tenant "default" organization does NOT set this; it requires an
   * active seat subscription on the org.
   */
  institutionManaged: boolean;
  /** The institution's name when {@link institutionManaged}; otherwise null. */
  institutionName: string | null;
}
