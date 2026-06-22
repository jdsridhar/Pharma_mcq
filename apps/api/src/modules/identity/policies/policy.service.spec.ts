import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '@pharmacy/contracts';
import type { AuthenticatedUser } from '../types/auth.types';
import { PolicyService } from './policy.service';

const author: AuthenticatedUser = {
  id: 'author-1',
  email: 'author@b.com',
  organizationId: null,
  roles: ['Content Author'],
  permissions: [PERMISSIONS.QUESTION_CREATE, PERMISSIONS.QUESTION_UPDATE],
};

const reviewer: AuthenticatedUser = {
  id: 'reviewer-1',
  email: 'reviewer@b.com',
  organizationId: null,
  roles: ['Reviewer'],
  permissions: [PERMISSIONS.QUESTION_REVIEW, PERMISSIONS.QUESTION_APPROVE],
};

describe('PolicyService', () => {
  const policy = new PolicyService();

  it('checks ownership', () => {
    expect(policy.isOwner(author, 'author-1')).toBe(true);
    expect(policy.isOwner(author, 'someone-else')).toBe(false);
    expect(policy.isOwner(author, null)).toBe(false);
  });

  it('allows the owner OR a holder of the override permission', () => {
    // Owner with no override permission — allowed because they own it.
    expect(() =>
      policy.assertOwnerOrPermission(author, 'author-1', PERMISSIONS.QUESTION_APPROVE),
    ).not.toThrow();

    // Non-owner but holds the override permission — allowed.
    expect(() =>
      policy.assertOwnerOrPermission(reviewer, 'author-1', PERMISSIONS.QUESTION_APPROVE),
    ).not.toThrow();

    // Non-owner without the override permission — denied.
    expect(() =>
      policy.assertOwnerOrPermission(author, 'reviewer-1', PERMISSIONS.QUESTION_APPROVE),
    ).toThrow(ForbiddenException);
  });
});
