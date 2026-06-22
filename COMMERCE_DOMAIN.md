# COMMERCE_DOMAIN.md — Phase 14

Monetization: a **plan catalog**, **provider-agnostic payments** (Razorpay first, §7-C), **subscriptions**, and **entitlements**. Money is integer minor units throughout.

**Status:** implemented & verified — API build ✅, **116 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. Model

- **`plans`** / **`plan_prices`** (`billingInterval`, `amountMinor`, `currency`, `@@unique(plan,interval,currency)`) / **`features`** / **`plan_features`** (limit).
- **`subscriptions`** (status, provider, period dates) — granted on payment capture.
- **`payments`** — `providerOrderId`, unique `providerPaymentId`, **unique `idempotencyKey`**, `rawPayload`.

## 2. Provider-agnostic payments (ports & adapters)

[`ports/payment.port.ts`](apps/api/src/modules/commerce/ports/payment.port.ts) defines `createOrder` + `verifyAndParseWebhook`. Two adapters:
- **ManualPaymentAdapter** (dev) — orders settle immediately; bound when Razorpay creds are absent.
- **RazorpayPaymentAdapter** — order via Razorpay REST (basic auth, global `fetch`); webhook verified by **HMAC-SHA256** over the raw body (`timingSafeEqual`). No SDK.

The `PAYMENT_PORT` is bound by an **env factory** in the module: Razorpay when `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET` are set, else Manual.

## 3. Structure (`apps/api/src/modules/commerce/`)

```
commerce.module.ts                 # PAYMENT_PORT env factory
catalog.service.ts                 # plans/prices/features/plan-features
subscription.service.ts            # checkout, webhook, activation
entitlement.service.ts             # active subscription → features (exported)
billing/period.ts                  # pure period-end math
ports/payment.port.ts · adapters/{manual,razorpay}-payment.adapter.ts
repositories/commerce.repository.ts
controllers/{commerce-catalog,subscription,webhook}.controller.ts
dto/
```
Shared schemas: [`@pharmacy/contracts/commerce`](packages/contracts/src/commerce/commerce.ts).

## 4. Endpoints (`/api/v1/commerce`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/plans` · `/plans/:id` | **public** | Active plans with prices + features |
| POST | `/plans` · `/plans/:id/prices` · `/features` | `plan:manage` | Create catalog entries |
| PATCH | `/plans/:id` · `/prices/:id` | `plan:manage` | Update |
| PUT | `/plans/:id/features` | `plan:manage` | Replace plan feature grants |
| GET | `/features` | `plan:manage` | List features |
| POST | `/subscriptions` | student-self | Start checkout |
| GET | `/me/subscriptions` · `/me/entitlements` | student-self | Own subs / entitlements |
| POST | `/webhooks/:provider` | **public** (signature-verified) | Provider webhook |

## 5. Subscription flow

`POST /subscriptions {planPriceId}` creates a `Payment` (unique `idempotencyKey`) + a provider order. For **Manual** (captured at order time) the subscription is **activated inline** (status ACTIVE, period from interval). For a real gateway, the response is `PENDING` with the order details for client-side checkout; the **webhook** (`payment.captured`) marks the payment CAPTURED and **activates** the subscription — **idempotent** on `providerOrderId`/already-captured. The webhook reads the **raw body** (`rawBody: true` on the Nest app) for HMAC verification; an invalid signature → 400.

## 6. Entitlements

`EntitlementService` resolves a user's **active** subscription → plan → features (`getEntitlements`, `check(userId, featureKey)`); exported so any domain can gate premium capabilities.

## 7. Testing

- **Unit:** `period.spec` (interval math); `subscription.service.spec` (**manual capture → ACTIVE**, gateway → PENDING, **idempotent webhook**); `entitlement.service.spec` (no-sub empty, feature mapping + `check`). (Suite: 116 green.)
- **e2e (`test/commerce.e2e-spec.ts`, needs DB + Redis):** admin builds catalog; **public** plan listing; student management 403; **subscribe (manual) → ACTIVE** + entitlements reflect the plan feature.

## 8. Notes

- The Razorpay adapter is real (REST + HMAC) but un-exercised on CI (no creds) — Manual is the test path; Stripe slots in as another adapter behind the same port.
- `Payment.idempotencyKey` guarantees no double-charge on retries; webhook idempotency guarantees no double-activation.
- Period roll-over/renewal billing and proration are future work; LIFETIME has no period end.
