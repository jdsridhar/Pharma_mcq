import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CheckoutResultDto,
  type EntitlementsDto,
  type OrgSubscriptionDto,
  PERMISSIONS,
  type SubscriptionDto,
} from '@pharmacy/contracts';
import { CurrentUser } from '../../identity/decorators/current-user.decorator';
import { Permissions } from '../../identity/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../identity/types/auth.types';
import { SubscribeDto } from '../dto/subscribe.dto';
import { EntitlementService } from '../entitlement.service';
import { OrgSubscriptionService } from '../org-subscription.service';
import { SubscriptionService } from '../subscription.service';

/** Subscription + entitlements — student-self. */
@ApiTags('Commerce')
@ApiBearerAuth()
@Controller('commerce')
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly entitlements: EntitlementService,
    private readonly orgSubscriptions: OrgSubscriptionService,
  ) {}

  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a subscription checkout (returns order or active subscription)' })
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubscribeDto,
  ): Promise<CheckoutResultDto> {
    return this.subscriptions.subscribe(user.id, user.organizationId, dto);
  }

  @Get('me/subscriptions')
  @ApiOperation({ summary: 'List the current user’s subscriptions' })
  mySubscriptions(@CurrentUser('id') userId: string): Promise<SubscriptionDto[]> {
    return this.subscriptions.listMine(userId);
  }

  @Get('me/entitlements')
  @ApiOperation({ summary: 'The current user’s entitlements (active plan features)' })
  myEntitlements(@CurrentUser() user: AuthenticatedUser): Promise<EntitlementsDto> {
    return this.entitlements.getEntitlements(user.id, user.organizationId);
  }

  /**
   * The caller's own institution subscription — for institution admins to see *their* chosen plan
   * and seat usage. Requires SUBSCRIPTION_READ (held by the Admin role); returns null when the
   * caller has no organization or the org has no active institution plan. Org-scoped to the
   * caller's own org, so an admin can never read another institution's billing.
   */
  @Get('me/organization/subscription')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  @ApiOperation({ summary: "The caller's institution subscription (org-admin view); null if none" })
  myOrgSubscription(@CurrentUser() user: AuthenticatedUser): Promise<OrgSubscriptionDto | null> {
    if (!user.organizationId) {
      return Promise.resolve(null);
    }
    return this.orgSubscriptions.getForOrg(user.organizationId);
  }
}
