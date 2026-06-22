import { Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { SubscriptionService } from '../subscription.service';

/**
 * Payment provider webhooks. Public (no JWT) but signature-verified using the RAW body.
 * `rawBody: true` is enabled on the Nest app so `req.rawBody` is available for HMAC checks.
 */
@ApiTags('Commerce')
@Controller('commerce/webhooks')
export class WebhookController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive + process a payment provider webhook' })
  async handle(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ): Promise<{ ok: true }> {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    return this.subscriptions.handleWebhook(provider, rawBody, signature);
  }
}
