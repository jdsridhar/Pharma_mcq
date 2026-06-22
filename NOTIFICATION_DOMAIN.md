# NOTIFICATION_DOMAIN.md — Phase 15

Persisted, multi-channel notifications: an **in-app feed** plus asynchronous delivery over **email / SMS / push / WhatsApp**, rendered from templates and dispatched by a BullMQ worker. Identity's auth emails now flow through this pipeline.

**Status:** implemented & verified — API build ✅, **123 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. Structure (`apps/api/src/modules/notification/`)

```
notification.module.ts            # channel registry factory
notification.service.ts           # notify(), sendTransactional(), feed, mark-read
notification.producer.ts          # enqueue (best-effort)
notification.processor.ts         # BullMQ worker → channel dispatch + status
templates/templates.ts            # pure render(key, payload) → {subject, body}
ports/notification-channel.port.ts
adapters/log-channel.adapter.ts   # dev transport (one per channel)
adapters/notification-mailer.ts   # implements Identity's MailerPort
repositories/notification.repository.ts
notification.controller.ts · dto/
```
Shared schemas: [`@pharmacy/contracts/notification`](packages/contracts/src/notification/notification.ts). The `notifications` BullMQ queue is registered in [`infra/queue`](apps/api/src/infra/queue/queue.module.ts).

## 2. Pipeline

`notify({userId, channel, template, payload})` →
1. resolve the recipient by channel (email / mobile / push token),
2. persist a `notifications` row (PENDING) — this **is** the in-app feed,
3. render the template, enqueue a delivery job (best-effort),
4. the **worker** dispatches via the channel adapter → marks **SENT** (or **FAILED** with the error).

Missing recipient ⇒ the row is marked FAILED without enqueueing. `sendTransactional({to, channel, ...})` skips the in-app row (one-off auth emails).

## 3. Channels & templates

- **Channels** are ports; the module binds a **registry** (`Map<channel, adapter>`) of dev `LogChannelAdapter`s. Production swaps SMTP/Twilio/FCM by re-keying the registry — no service changes.
- **Templates** are pure `render(key, payload)` functions (welcome, email_verification, password_reset, subscription_active, revision_due, announcement, generic), unit-tested, and reused for the in-app feed's title/body.

## 4. Endpoints (`/api/v1/notifications`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/` | `notification:manage` | Send a templated notification to a user |
| GET | `/me` | student-self | In-app feed (paginated, `unreadOnly`) |
| POST | `/:id/read` | student-self | Mark one read |
| POST | `/me/read-all` | student-self | Mark all read |

## 5. Identity integration

Identity's `MAILER` token is rebound from `LogMailer` to **`NotificationMailer`** (exported by this module), so email verification + password-reset mails go through the notification pipeline. Identity → Notification is a one-way dependency (Notification never imports Identity values → no cycle).

## 6. Testing

- **Unit:** `templates.spec` (render known/numeric/fallback); `notification.service.spec` (create + enqueue rendered, **no-recipient → FAILED**, mark-read ownership → 403, mark-read success). (Suite: 123 green.)
- **e2e (`test/notification.e2e-spec.ts`, needs DB + Redis):** admin sends → student 403 on send → notification in feed → mark read sets `readAt`.

## 7. Notes

- The worker auto-starts on app boot (needs Redis); enqueue is best-effort so a queue outage never fails the originating request.
- Quiet hours, user notification preferences (`student_preferences`), digest batching, and real provider adapters are future enhancements behind the same port + registry.
- The transactional outbox (`outbox_events`, Phase 2) can later guarantee at-least-once enqueue from the same DB transaction as the triggering write.
