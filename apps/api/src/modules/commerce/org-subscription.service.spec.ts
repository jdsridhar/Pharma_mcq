import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { CommerceRepository, SubscriptionWithPlan } from './repositories/commerce.repository';
import { OrgSubscriptionService } from './org-subscription.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function activeSub(seatLimit: number | null): SubscriptionWithPlan {
  return {
    id: 'sub1',
    userId: 'super',
    organizationId: 'org1',
    planId: 'plan1',
    planPriceId: null,
    status: 'ACTIVE',
    provider: 'MANUAL',
    providerSubscriptionId: null,
    currentPeriodStart: NOW,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: NOW,
    updatedAt: NOW,
    plan: {
      id: 'plan1',
      code: 'INST-50',
      name: 'Institution 50',
      description: null,
      isActive: true,
      seatLimit,
      createdAt: NOW,
      updatedAt: NOW,
      features: [],
    },
  } as unknown as SubscriptionWithPlan;
}

function makeRepoMock() {
  return {
    findOrganizationById: jest.fn(),
    findPlanById: jest.fn(),
    findPriceById: jest.fn(),
    cancelActiveOrgSubscriptions: jest.fn().mockResolvedValue(undefined),
    createOrgSubscription: jest.fn().mockResolvedValue({ id: 'sub1' }),
    findActiveOrgSubscription: jest.fn(),
    countOrgMembers: jest.fn(),
  };
}

describe('OrgSubscriptionService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: OrgSubscriptionService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new OrgSubscriptionService(repo as unknown as CommerceRepository);
  });

  describe('assertCanOnboard', () => {
    it('is a no-op when the org has no active subscription', async () => {
      repo.findActiveOrgSubscription.mockResolvedValue(null);
      await expect(service.assertCanOnboard('org1')).resolves.toBeUndefined();
      expect(repo.countOrgMembers).not.toHaveBeenCalled();
    });

    it('throws 409 when seats are full', async () => {
      repo.findActiveOrgSubscription.mockResolvedValue(activeSub(50));
      repo.countOrgMembers.mockResolvedValue(50);
      await expect(service.assertCanOnboard('org1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes when a seat is still available', async () => {
      repo.findActiveOrgSubscription.mockResolvedValue(activeSub(50));
      repo.countOrgMembers.mockResolvedValue(49);
      await expect(service.assertCanOnboard('org1')).resolves.toBeUndefined();
    });
  });

  describe('provision', () => {
    it('404s for an unknown organization', async () => {
      repo.findOrganizationById.mockResolvedValue(null);
      await expect(
        service.provision('org1', { planId: 'plan1' }, 'super'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a non-institutional plan (no seat limit) with 400', async () => {
      repo.findOrganizationById.mockResolvedValue({ id: 'org1' });
      repo.findPlanById.mockResolvedValue({ id: 'plan1', isActive: true, seatLimit: null });
      await expect(
        service.provision('org1', { planId: 'plan1' }, 'super'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createOrgSubscription).not.toHaveBeenCalled();
    });

    it('provisions seats and returns live usage', async () => {
      repo.findOrganizationById.mockResolvedValue({ id: 'org1' });
      repo.findPlanById.mockResolvedValue({ id: 'plan1', isActive: true, seatLimit: 50 });
      repo.findActiveOrgSubscription.mockResolvedValue(activeSub(50));
      repo.countOrgMembers.mockResolvedValue(3);

      const dto = await service.provision('org1', { planId: 'plan1' }, 'super');
      expect(repo.cancelActiveOrgSubscriptions).toHaveBeenCalledWith('org1');
      expect(repo.createOrgSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org1', planId: 'plan1', status: 'ACTIVE', provider: 'MANUAL' }),
      );
      expect(dto).toMatchObject({ seatLimit: 50, seatsUsed: 3, seatsAvailable: 47 });
    });
  });
});
