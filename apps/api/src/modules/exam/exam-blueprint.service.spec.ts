import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ExamBlueprintItem } from '@prisma/client';
import type { TenantScopeService } from '../../common/tenancy/tenant-scope.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import { ExamBlueprintService } from './exam-blueprint.service';
import type { ExamBlueprintWithItems, ExamRepository } from './repositories/exam.repository';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: 'u1',
  email: 'admin@b.com',
  organizationId: null,
  roles: ['Super Admin'],
  permissions: [],
};

function blueprint(overrides: Partial<ExamBlueprintWithItems> = {}): ExamBlueprintWithItems {
  return {
    id: 'bp1',
    examProfileId: 'exam1',
    name: 'GPAT Full',
    totalQuestions: 125,
    durationMinutes: 180,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    items: [],
    ...overrides,
  } as ExamBlueprintWithItems;
}

function item(overrides: Partial<ExamBlueprintItem> = {}): ExamBlueprintItem {
  return {
    id: 'it1',
    blueprintId: 'bp1',
    knowledgeNodeId: null,
    label: 'Pharmacology',
    weightPercent: 30,
    questionCount: 40,
    difficultyMix: null,
    ...overrides,
  } as ExamBlueprintItem;
}

function makeRepoMock() {
  return {
    findProfileById: jest.fn().mockResolvedValue({ id: 'exam1', organizationId: null }),
    findBlueprintById: jest.fn(),
    findItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    sumItemWeight: jest.fn(),
    findExistingKnowledgeNodeIds: jest.fn(),
    countPublishedCandidates: jest.fn().mockResolvedValue(0),
  };
}

/** Tenant stub that behaves like a platform-wide Super Admin (every scope check passes). */
function makeTenantMock() {
  return {
    ownerOrgFor: jest.fn().mockResolvedValue(null),
    isSuper: jest.fn().mockReturnValue(true),
    canRead: jest.fn().mockReturnValue(true),
    canManage: jest.fn().mockResolvedValue(true),
  };
}

describe('ExamBlueprintService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let tenant: ReturnType<typeof makeTenantMock>;
  let service: ExamBlueprintService;

  beforeEach(() => {
    repo = makeRepoMock();
    tenant = makeTenantMock();
    service = new ExamBlueprintService(
      repo as unknown as ExamRepository,
      tenant as unknown as TenantScopeService,
    );
    repo.findBlueprintById.mockResolvedValue(blueprint());
  });

  it('rejects an item that pushes total weight over 100% (400)', async () => {
    repo.sumItemWeight.mockResolvedValue(80);
    await expect(
      service.addItem('exam1', 'bp1', { label: 'X', weightPercent: 30, questionCount: 10 }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createItem).not.toHaveBeenCalled();
  });

  it('adds an item within the weight budget', async () => {
    repo.sumItemWeight.mockResolvedValue(50);
    repo.createItem.mockResolvedValue(item({ weightPercent: 40 }));
    const dto = await service.addItem(
      'exam1',
      'bp1',
      { label: 'Pharmacology', weightPercent: 40, questionCount: 40 },
      actor,
    );
    expect(dto.weightPercent).toBe(40);
    expect(repo.createItem).toHaveBeenCalled();
  });

  it('rejects an item referencing an unknown knowledge node (400)', async () => {
    repo.sumItemWeight.mockResolvedValue(0);
    repo.findExistingKnowledgeNodeIds.mockResolvedValue(new Set<string>());
    await expect(
      service.addItem(
        'exam1',
        'bp1',
        {
          label: 'X',
          weightPercent: 10,
          questionCount: 5,
          knowledgeNodeId: '00000000-0000-0000-0000-0000000000aa',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excludes the edited item from the weight budget on update', async () => {
    repo.findItemById.mockResolvedValue(item({ id: 'it1', weightPercent: 30 }));
    repo.sumItemWeight.mockResolvedValue(70); // other items
    await expect(
      service.updateItem('exam1', 'bp1', 'it1', { weightPercent: 40 }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.sumItemWeight).toHaveBeenCalledWith('bp1', 'it1');
  });

  it('404s when the blueprint does not belong to the exam', async () => {
    repo.findBlueprintById.mockResolvedValue(blueprint({ examProfileId: 'OTHER' }));
    await expect(service.get('exam1', 'bp1', actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── Weight-driven derivation + completeness ──
  it('derives item question counts from weights and reports a complete blueprint as ready', async () => {
    repo.findBlueprintById.mockResolvedValue(
      blueprint({
        totalQuestions: 50,
        items: [
          item({ id: 'a', label: 'A', weightPercent: 50, questionCount: 999 }),
          item({ id: 'b', label: 'B', weightPercent: 50, questionCount: 999 }),
        ],
      }),
    );
    const dto = await service.get('exam1', 'bp1', actor);
    expect(dto.items.map((i) => i.questionCount)).toEqual([25, 25]); // derived; stored 999 ignored
    expect(dto.weightTotal).toBe(100);
    expect(dto.isReady).toBe(true);
  });

  it('flags a weights-under-100% blueprint as not ready', async () => {
    repo.findBlueprintById.mockResolvedValue(
      blueprint({ totalQuestions: 50, items: [item({ weightPercent: 30 })] }),
    );
    const dto = await service.get('exam1', 'bp1', actor);
    expect(dto.weightTotal).toBe(30);
    expect(dto.isReady).toBe(false);
  });

  // ── Author-facing plan (dry run) ──
  it('plan() warns about under-supplied sections and a weight gap', async () => {
    repo.findBlueprintById.mockResolvedValue(
      blueprint({
        totalQuestions: 50,
        items: [item({ id: 'a', label: 'Pharma', weightPercent: 50, knowledgeNodeId: 'k1' })],
      }),
    );
    repo.countPublishedCandidates.mockResolvedValue(3); // target 25, only 3 available
    const plan = await service.plan('exam1', 'bp1', actor);
    expect(plan.sections[0]).toMatchObject({ targetCount: 25, availableCount: 3 });
    expect(plan.sourceableCount).toBe(3);
    expect(plan.isReady).toBe(false);
    expect(plan.warnings.length).toBeGreaterThanOrEqual(2); // under-supply + weights < 100%
  });
});
