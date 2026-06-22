/**
 * @pharmacy/contracts — shared, framework-agnostic contracts (types + Zod schemas)
 * used by BOTH the NestJS API and the Next.js web app. Keeping these in one place
 * prevents drift between client and server.
 *
 * Domain-specific DTOs are added here per phase (identity, question, exam, ...).
 */
export * from './common/ids';
export * from './common/enums';
export * from './common/pagination';
export * from './common/api-response';

// Identity domain (Phase 3)
export * from './identity/auth';
export * from './identity/rbac';

// Knowledge domain (Phase 4)
export * from './knowledge/knowledge';

// Question domain (Phase 5)
export * from './question/question';

// Curriculum domain (Phase 6)
export * from './curriculum/curriculum';

// Exam domain (Phase 7)
export * from './exam/exam';

// Learning domain (Phase 8)
export * from './learning/learning';

// Practice domain (Phase 9)
export * from './practice/practice';

// Assessment domain (Phase 10)
export * from './assessment/assessment';

// Revision domain (Phase 11)
export * from './revision/revision';

// Analytics domain (Phase 12)
export * from './analytics/analytics';

// Recommendation domain (Phase 13)
export * from './recommendation/recommendation';

// Commerce domain (Phase 14)
export * from './commerce/commerce';

// Notification domain (Phase 15)
export * from './notification/notification';

// Admin domain (Phase 16)
export * from './admin/admin';
