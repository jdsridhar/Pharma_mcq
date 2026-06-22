import { Module } from '@nestjs/common';
import type { ServerEnv } from '@pharmacy/config';
import { APP_ENV } from '../../config/app-config.module';
import { ManualPaymentAdapter } from './adapters/manual-payment.adapter';
import { RazorpayPaymentAdapter } from './adapters/razorpay-payment.adapter';
import { CatalogService } from './catalog.service';
import { CommerceCatalogController } from './controllers/commerce-catalog.controller';
import { SubscriptionController } from './controllers/subscription.controller';
import { WebhookController } from './controllers/webhook.controller';
import { EntitlementService } from './entitlement.service';
import { OrgSubscriptionService } from './org-subscription.service';
import { PAYMENT_PORT, type PaymentPort } from './ports/payment.port';
import { CommerceRepository } from './repositories/commerce.repository';
import { SubscriptionService } from './subscription.service';

/**
 * Commerce domain — plans/prices/features (catalog), subscriptions + provider-agnostic
 * payments, and entitlements. The `PAYMENT_PORT` binds the Razorpay adapter when credentials
 * are configured, otherwise the Manual adapter (dev). `EntitlementService` is exported so
 * other domains can gate premium features.
 */
@Module({
  controllers: [CommerceCatalogController, SubscriptionController, WebhookController],
  providers: [
    CatalogService,
    SubscriptionService,
    EntitlementService,
    OrgSubscriptionService,
    CommerceRepository,
    {
      provide: PAYMENT_PORT,
      inject: [APP_ENV],
      useFactory: (env: ServerEnv): PaymentPort =>
        env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
          ? new RazorpayPaymentAdapter(env)
          : new ManualPaymentAdapter(),
    },
  ],
  exports: [EntitlementService, OrgSubscriptionService],
})
export class CommerceModule {}
