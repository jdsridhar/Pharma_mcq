import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { CreateQuestionInput, CreateVersionInput } from '@pharmacy/contracts';
import type { Question } from '@prisma/client';
import { PolicyService } from '../identity/policies/policy.service';
import type { AuthenticatedUser } from '../identity/types/auth.types';
import {
  type QuestionDetailRow,
  type QuestionRepository,
  type QuestionVersionRow,
} from './repositories/question.repository';
import { QuestionService } from './question.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function questionRow(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    questionCode: 'Q1',
    questionType: 'SINGLE_CHOICE',
    status: 'DRAFT',
    authorDifficulty: 'MEDIUM',
    calculatedDifficulty: null,
    language: 'en',
    normalizedTextHash: null,
    currentVersionId: null,
    createdById: 'owner',
    organizationId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function versionRow(overrides: Partial<QuestionVersionRow> = {}): QuestionVersionRow {
  return {
    id: 'v1',
    questionId: 'q1',
    versionNumber: 1,
    questionText: 'What is aspirin?',
    explanation: null,
    answerSpec: { type: 'SINGLE_CHOICE' } as unknown as QuestionVersionRow['answerSpec'],
    normalizedTextHash: 'hash',
    status: 'DRAFT',
    createdById: 'owner',
    createdAt: NOW,
    options: [],
    media: [],
    ...overrides,
  };
}

function detailRow(overrides: Partial<QuestionDetailRow> = {}): QuestionDetailRow {
  return {
    ...questionRow(),
    currentVersion: null,
    knowledgeMappings: [],
    curriculumMappings: [],
    examMappings: [],
    trackMappings: [],
    tagMappings: [],
    ...overrides,
  } as QuestionDetailRow;
}

function makeRepoMock() {
  return {
    createWithVersion: jest.fn(),
    addVersion: jest.fn(),
    findById: jest.fn(),
    findDetailById: jest.fn(),
    findWorkingVersion: jest.fn(),
    findAllVersions: jest.fn(),
    updateQuestion: jest.fn(),
    updateVersionStatus: jest.fn(),
    softDelete: jest.fn(),
    list: jest.fn(),
    findByNormalizedHash: jest.fn(),
    similarCandidates: jest.fn(),
  };
}

const owner: AuthenticatedUser = {
  id: 'owner',
  email: 'owner@b.com',
  organizationId: null,
  roles: ['Content Author'],
  permissions: ['question:create', 'question:update'],
};

const createInput: CreateQuestionInput = {
  questionCode: 'Q1',
  questionType: 'SINGLE_CHOICE',
  authorDifficulty: 'MEDIUM',
  language: 'en',
  questionText: 'What is aspirin?',
  answerSpec: { type: 'SINGLE_CHOICE' },
  options: [
    { text: 'A drug', isCorrect: true, displayOrder: 0 },
    { text: 'A food', isCorrect: false, displayOrder: 1 },
  ],
};

describe('QuestionService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: QuestionService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new QuestionService(repo as unknown as QuestionRepository, new PolicyService());
  });

  describe('create', () => {
    it('rejects an exact-duplicate question (409) without writing', async () => {
      repo.findByNormalizedHash.mockResolvedValue({ id: 'other', questionCode: 'OTHER' });
      await expect(service.create(createInput, owner)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.createWithVersion).not.toHaveBeenCalled();
    });

    it('creates a question and returns its detail', async () => {
      repo.findByNormalizedHash.mockResolvedValue(null);
      repo.createWithVersion.mockResolvedValue(detailRow());
      repo.findDetailById.mockResolvedValue(detailRow());
      repo.findWorkingVersion.mockResolvedValue(versionRow());

      const dto = await service.create(createInput, owner);
      expect(dto.questionCode).toBe('Q1');
      expect(dto.workingVersion?.versionNumber).toBe(1);
      expect(repo.createWithVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe('addVersion', () => {
    it('forbids a non-owner without review permission', async () => {
      repo.findById.mockResolvedValue(questionRow({ createdById: 'owner' }));
      const stranger: AuthenticatedUser = { ...owner, id: 'stranger', permissions: ['question:update'] };
      await expect(
        service.addVersion('q1', createInput as unknown as CreateVersionInput, stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects changing the question type across versions (409)', async () => {
      repo.findById.mockResolvedValue(questionRow({ questionType: 'SINGLE_CHOICE', createdById: 'owner' }));
      const input = { ...createInput, questionType: 'MULTI_CHOICE' } as unknown as CreateVersionInput;
      await expect(service.addVersion('q1', input, owner)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('workflow transitions', () => {
    it('rejects approving a DRAFT question (must be REVIEW)', async () => {
      repo.findById.mockResolvedValue(questionRow({ status: 'DRAFT' }));
      await expect(service.approve('q1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('publishes an APPROVED question, promoting the working version', async () => {
      repo.findById.mockResolvedValue(questionRow({ status: 'APPROVED', currentVersionId: null }));
      repo.findWorkingVersion.mockResolvedValue(versionRow({ id: 'v2', normalizedTextHash: 'hh' }));
      repo.updateQuestion.mockResolvedValue(questionRow());
      repo.updateVersionStatus.mockResolvedValue({});
      repo.findDetailById.mockResolvedValue(
        detailRow({ status: 'PUBLISHED', currentVersion: versionRow({ id: 'v2' }) }),
      );

      const dto = await service.publish('q1');
      expect(dto.status).toBe('PUBLISHED');
      expect(repo.updateQuestion).toHaveBeenCalledWith(
        'q1',
        expect.objectContaining({
          status: 'PUBLISHED',
          normalizedTextHash: 'hh',
          currentVersion: { connect: { id: 'v2' } },
        }),
      );
      expect(repo.updateVersionStatus).toHaveBeenCalledWith('v2', 'PUBLISHED');
    });
  });
});
