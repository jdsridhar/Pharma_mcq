import type { CommerceRepository, SubscriptionWithPlan } from './repositories/commerce.repository';
import { EntitlementService } from './entitlement.service';

function makeRepoMock() {
  return {
    findActiveSubscription: jest.fn(),
    findActiveOrgSubscription: jest.fn().mockResolvedValue(null),
    findOrganizationById: jest.fn(),
  };
}

describe('EntitlementService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: EntitlementService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new EntitlementService(repo as unknown as CommerceRepository);
  });

  it('returns empty entitlements when there is no active subscription', async () => {
    repo.findActiveSubscription.mockResolvedValue(null);
    expect(await service.getEntitlements('u1')).toEqual({
      plan: null,
      features: [],
      institutionManaged: false,
      institutionName: null,
    });
    expect(await service.check('u1', 'mock_tests')).toBe(false);
  });

  it('is not institution-managed for the default org without an active seat plan', async () => {
    repo.findActiveSubscription.mockResolvedValue(null);
    repo.findActiveOrgSubscription.mockResolvedValue(null);
    const ent = await service.getEntitlements('u1', 'org-default');
    expect(ent.institutionManaged).toBe(false);
    expect(ent.institutionName).toBeNull();
  });

  it('is not institution-managed when the org plan has no seat cap', async () => {
    repo.findActiveSubscription.mockResolvedValue(null);
    repo.findActiveOrgSubscription.mockResolvedValue({ plan: { seatLimit: null } } as unknown as SubscriptionWithPlan);
    const ent = await service.getEntitlements('u1', 'org-1');
    expect(ent.institutionManaged).toBe(false);
  });

  it('is institution-managed when the org has an active seat (institutional) plan', async () => {
    repo.findActiveSubscription.mockResolvedValue(null);
    repo.findActiveOrgSubscription.mockResolvedValue({ plan: { seatLimit: 50 } } as unknown as SubscriptionWithPlan);
    repo.findOrganizationById.mockResolvedValue({ name: 'Acme College' });
    const ent = await service.getEntitlements('u1', 'org-1');
    expect(ent.institutionManaged).toBe(true);
    expect(ent.institutionName).toBe('Acme College');
  });

  it('maps plan features to entitlements', async () => {
    repo.findActiveSubscription.mockResolvedValue({
      plan: {
        code: 'PRO',
        name: 'Pro',
        features: [
          { limit: null, feature: { key: 'mock_tests', name: 'Mock tests' } },
          { limit: 100, feature: { key: 'daily_questions', name: 'Daily questions' } },
        ],
      },
    } as unknown as SubscriptionWithPlan);

    const entitlements = await service.getEntitlements('u1');
    expect(entitlements.plan).toEqual({ code: 'PRO', name: 'Pro' });
    expect(entitlements.features).toEqual([
      { key: 'mock_tests', name: 'Mock tests', limit: null },
      { key: 'daily_questions', name: 'Daily questions', limit: 100 },
    ]);
    expect(await service.check('u1', 'mock_tests')).toBe(true);
    expect(await service.check('u1', 'nope')).toBe(false);
  });
});
