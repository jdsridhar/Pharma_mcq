import type {
  AdminRoleDto,
  AdminUserDto,
  AssignOrgSubscriptionInput,
  AuditLogDto,
  AuthResult,
  BulkActionResultDto,
  CheckoutResultDto,
  CreateCurriculumInput,
  CreateCurriculumNodeInput,
  CreateExamProfileInput,
  CreateFeatureInput,
  CreateKnowledgeEdgeInput,
  CreateKnowledgeNodeInput,
  CreateMockTestInput,
  CreateOrganizationInput,
  CreatePlanInput,
  CreatePlanPriceInput,
  CreateQuestionInput,
  CreateUserInput,
  CreateVersionInput,
  CurriculumDto,
  CurriculumNodeDto,
  CurriculumTreeNodeDto,
  EntitlementsDto,
  ExamProfileDto,
  FeatureDto,
  KnowledgeEdgeDto,
  KnowledgeNodeDto,
  LoginInput,
  MarkAllReadResultDto,
  MasteryEntryDto,
  MasteryOverviewDto,
  MockTestDetailDto,
  MockTestDto,
  NotificationDto,
  OrganizationDto,
  OrgSubscriptionDto,
  Paginated,
  PlanDetailDto,
  PlanPriceDto,
  PracticeAnswerResultDto,
  PracticeAvailableDto,
  PracticeAvailableQuery,
  PracticeSessionDetailDto,
  PracticeSessionDto,
  PracticeSummaryDto,
  QuestionBulkAction,
  QuestionDetailDto,
  QuestionSummaryDto,
  QuestionVersionDto,
  RecommendationDto,
  RegisterInput,
  ReviewQuestionDto,
  RevisionItemDto,
  SetExamMappingsInput,
  SetKnowledgeMappingsInput,
  SetMockTestQuestionsInput,
  SetPlanFeaturesInput,
  StartPracticeSessionInput,
  StudyPlanDto,
  StudyPlanInput,
  SubmitPracticeAnswerInput,
  SubmitTestAnswerInput,
  SubscriptionDto,
  TestResultDto,
  TestSessionDetailDto,
  UpdateMockTestInput,
  UpdateQuestionMetaInput,
  UserPublic,
  WeakAreaDto,
} from '@pharmacy/contracts';
import type {
  BlueprintPlanDto,
  CreateExamBlueprintInput,
  CreateExamBlueprintItemInput,
  CreateLearningTrackInput,
  CreateRecommendationRuleInput,
  CreateTrackModuleInput,
  ExamBlueprintDto,
  LearningTrackDetailDto,
  LearningTrackDto,
  RecommendationRuleDto,
  SetCurriculumMappingsInput,
  SetCurriculumNodeKnowledgeInput,
  SetExamKnowledgeInput,
  SetTagsInput,
  SetTrackMappingsInput,
  SetTrackModuleKnowledgeInput,
  TrackModuleDto,
  UpdateRecommendationRuleInput,
} from '@pharmacy/contracts';
import { apiFetch } from '../api-client';

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

export const authApi = {
  login: (input: LoginInput) => apiFetch<AuthResult>('/v1/auth/login', json(input)),
  register: (input: RegisterInput) => apiFetch<AuthResult>('/v1/auth/register', json(input)),
  // Restore a session from the httpOnly refresh cookie (rotates + returns the user). apiFetch
  // never auto-retries the refresh path, so a 401 here just means "not logged in".
  refresh: () => apiFetch<AuthResult>('/v1/auth/refresh', { method: 'POST', body: '{}' }),
  me: () => apiFetch<UserPublic>('/v1/auth/me'),
  logout: () => apiFetch<void>('/v1/auth/logout', { method: 'POST', body: '{}' }),
};

export const analyticsApi = {
  overview: () => apiFetch<MasteryOverviewDto>('/v1/analytics/me/overview'),
  mastery: () => apiFetch<MasteryEntryDto[]>('/v1/analytics/me/mastery'),
  recompute: () => apiFetch<{ nodes: number }>('/v1/analytics/me/recompute-mastery', { method: 'POST', body: '{}' }),
};

export const recommendationApi = {
  feed: () => apiFetch<RecommendationDto[]>('/v1/recommendations/me'),
  generate: () => apiFetch<RecommendationDto[]>('/v1/recommendations/me/generate', { method: 'POST', body: '{}' }),
  weakAreas: () => apiFetch<WeakAreaDto[]>('/v1/recommendations/me/weak-areas'),
  studyPlan: (input: StudyPlanInput) =>
    apiFetch<StudyPlanDto>('/v1/recommendations/me/study-plan', json(input)),
};

export const practiceApi = {
  start: (input: StartPracticeSessionInput) =>
    apiFetch<PracticeSessionDetailDto>('/v1/practice/sessions', json(input)),
  available: (query: PracticeAvailableQuery) =>
    apiFetch<PracticeAvailableDto>(`/v1/practice/sessions/available${qs({ ...query })}`),
  list: () => apiFetch<Paginated<PracticeSessionDto>>('/v1/practice/sessions'),
  get: (id: string) => apiFetch<PracticeSessionDetailDto>(`/v1/practice/sessions/${id}`),
  answer: (id: string, input: SubmitPracticeAnswerInput) =>
    apiFetch<PracticeAnswerResultDto>(`/v1/practice/sessions/${id}/answers`, json(input)),
  complete: (id: string) => apiFetch<PracticeSummaryDto>(`/v1/practice/sessions/${id}/complete`, { method: 'POST', body: '{}' }),
  summary: (id: string) => apiFetch<PracticeSummaryDto>(`/v1/practice/sessions/${id}/summary`),
};

export const mockTestApi = {
  list: () => apiFetch<Paginated<MockTestDto>>(`/v1/mock-tests${qs({ status: 'PUBLISHED' })}`),
  get: (id: string) => apiFetch<MockTestDetailDto>(`/v1/mock-tests/${id}`),
  start: (id: string) => apiFetch<TestSessionDetailDto>(`/v1/mock-tests/${id}/start`, { method: 'POST', body: '{}' }),
  session: (id: string) => apiFetch<TestSessionDetailDto>(`/v1/assessments/sessions/${id}`),
  answer: (id: string, input: SubmitTestAnswerInput) =>
    apiFetch<{ snapshotId: string }>(`/v1/assessments/sessions/${id}/answers`, json(input)),
  submit: (id: string) => apiFetch<TestResultDto>(`/v1/assessments/sessions/${id}/submit`, { method: 'POST', body: '{}' }),
  result: (id: string) => apiFetch<TestResultDto>(`/v1/assessments/sessions/${id}/result`),
  // Admin (mocktest:manage)
  listAll: (status?: string) => apiFetch<Paginated<MockTestDto>>(`/v1/mock-tests${qs({ status, pageSize: 100 })}`),
  create: (input: CreateMockTestInput) => apiFetch<MockTestDetailDto>('/v1/mock-tests', json(input)),
  update: (id: string, input: UpdateMockTestInput) =>
    apiFetch<MockTestDto>(`/v1/mock-tests/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  setQuestions: (id: string, input: SetMockTestQuestionsInput) =>
    apiFetch<MockTestDetailDto>(`/v1/mock-tests/${id}/questions`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const revisionApi = {
  due: () => apiFetch<RevisionItemDto[]>('/v1/revision/due'),
  queue: () => apiFetch<Paginated<RevisionItemDto>>('/v1/revision/queue'),
  review: (id: string, outcome: 'CORRECT' | 'WRONG' | 'SKIPPED') =>
    apiFetch<RevisionItemDto>(`/v1/revision/items/${id}/review`, json({ outcome })),
  generateFromWrong: () => apiFetch<{ added: number }>('/v1/revision/generate-from-wrong', json({ limit: 50 })),
};

export const commerceApi = {
  plans: () => apiFetch<PlanDetailDto[]>('/v1/commerce/plans'),
  subscribe: (planPriceId: string) =>
    apiFetch<CheckoutResultDto>('/v1/commerce/subscriptions', json({ planPriceId })),
  mySubscriptions: () => apiFetch<SubscriptionDto[]>('/v1/commerce/me/subscriptions'),
  entitlements: () => apiFetch<EntitlementsDto>('/v1/commerce/me/entitlements'),
  myOrgSubscription: () =>
    apiFetch<OrgSubscriptionDto | null>('/v1/commerce/me/organization/subscription'),
  // Admin (plan:manage)
  createPlan: (input: CreatePlanInput) => apiFetch<PlanDetailDto>('/v1/commerce/plans', json(input)),
  addPrice: (planId: string, input: CreatePlanPriceInput) =>
    apiFetch<PlanPriceDto>(`/v1/commerce/plans/${planId}/prices`, json(input)),
  listFeatures: () => apiFetch<FeatureDto[]>('/v1/commerce/features'),
  createFeature: (input: CreateFeatureInput) => apiFetch<FeatureDto>('/v1/commerce/features', json(input)),
  setPlanFeatures: (planId: string, input: SetPlanFeaturesInput) =>
    apiFetch<PlanDetailDto>(`/v1/commerce/plans/${planId}/features`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const questionApi = {
  list: (params: { status?: string; type?: string; search?: string; page?: number; pageSize?: number } = {}) =>
    apiFetch<Paginated<QuestionSummaryDto>>(`/v1/questions${qs({ pageSize: 50, ...params })}`),
  bulkAction: (ids: string[], action: QuestionBulkAction, reason?: string) =>
    apiFetch<BulkActionResultDto>('/v1/questions/bulk', json({ ids, action, reason })),
  get: (id: string) => apiFetch<QuestionDetailDto>(`/v1/questions/${id}`),
  create: (input: CreateQuestionInput) => apiFetch<QuestionDetailDto>('/v1/questions', json(input)),
  addVersion: (id: string, input: CreateVersionInput) =>
    apiFetch<QuestionDetailDto>(`/v1/questions/${id}/versions`, json(input)),
  updateMeta: (id: string, input: UpdateQuestionMetaInput) =>
    apiFetch<QuestionDetailDto>(`/v1/questions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  versions: (id: string) => apiFetch<QuestionVersionDto[]>(`/v1/questions/${id}/versions`),
  submit: (id: string) => apiFetch<QuestionDetailDto>(`/v1/questions/${id}/submit`, { method: 'POST', body: '{}' }),
  approve: (id: string) => apiFetch<QuestionDetailDto>(`/v1/questions/${id}/approve`, { method: 'POST', body: '{}' }),
  reject: (id: string, reason: string) =>
    apiFetch<QuestionDetailDto>(`/v1/questions/${id}/reject`, json({ reason })),
  publish: (id: string) => apiFetch<QuestionDetailDto>(`/v1/questions/${id}/publish`, { method: 'POST', body: '{}' }),
  remove: (id: string) => apiFetch<void>(`/v1/questions/${id}`, { method: 'DELETE' }),
  setKnowledgeMappings: (id: string, input: SetKnowledgeMappingsInput) =>
    apiFetch<unknown>(`/v1/questions/${id}/mappings/knowledge`, { method: 'PUT', body: JSON.stringify(input) }),
  setExamMappings: (id: string, input: SetExamMappingsInput) =>
    apiFetch<unknown>(`/v1/questions/${id}/mappings/exams`, { method: 'PUT', body: JSON.stringify(input) }),
  setCurriculumMappings: (id: string, input: SetCurriculumMappingsInput) =>
    apiFetch<unknown>(`/v1/questions/${id}/mappings/curriculum`, { method: 'PUT', body: JSON.stringify(input) }),
  setTrackMappings: (id: string, input: SetTrackMappingsInput) =>
    apiFetch<unknown>(`/v1/questions/${id}/mappings/tracks`, { method: 'PUT', body: JSON.stringify(input) }),
  setTags: (id: string, input: SetTagsInput) =>
    apiFetch<unknown>(`/v1/questions/${id}/mappings/tags`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const notificationApi = {
  feed: (pageSize = 30) => apiFetch<Paginated<NotificationDto>>(`/v1/notifications/me${qs({ pageSize })}`),
  read: (id: string) => apiFetch<NotificationDto>(`/v1/notifications/${id}/read`, { method: 'POST', body: '{}' }),
  readAll: () => apiFetch<MarkAllReadResultDto>('/v1/notifications/me/read-all', { method: 'POST', body: '{}' }),
};

export const adminApi = {
  users: (search?: string) =>
    apiFetch<Paginated<AdminUserDto>>(`/v1/admin/users${qs({ search, pageSize: 50 })}`),
  createUser: (input: CreateUserInput) => apiFetch<AdminUserDto>('/v1/admin/users', json(input)),
  roles: () => apiFetch<AdminRoleDto[]>('/v1/admin/roles'),
  assignRole: (userId: string, roleId: string) =>
    apiFetch<AdminUserDto>(`/v1/admin/users/${userId}/roles`, json({ roleId })),
  setStatus: (userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') =>
    apiFetch<AdminUserDto>(`/v1/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  auditLogs: () => apiFetch<Paginated<AuditLogDto>>(`/v1/admin/audit-logs${qs({ pageSize: 50 })}`),
  reviewQueue: () => apiFetch<Paginated<ReviewQuestionDto>>('/v1/admin/review-queue'),
  organizations: () => apiFetch<OrganizationDto[]>('/v1/admin/organizations'),
  createOrganization: (input: CreateOrganizationInput) => apiFetch<OrganizationDto>('/v1/admin/organizations', json(input)),
  orgSubscription: (orgId: string) =>
    apiFetch<OrgSubscriptionDto | null>(`/v1/admin/organizations/${orgId}/subscription`),
  provisionOrgSubscription: (orgId: string, input: AssignOrgSubscriptionInput) =>
    apiFetch<OrgSubscriptionDto>(`/v1/admin/organizations/${orgId}/subscription`, json(input)),
};

export const knowledgeApi = {
  list: (params: { type?: string; search?: string; page?: number; pageSize?: number } = {}) =>
    apiFetch<Paginated<KnowledgeNodeDto>>(`/v1/knowledge/nodes${qs({ pageSize: 100, ...params })}`),
  get: (id: string) => apiFetch<KnowledgeNodeDto>(`/v1/knowledge/nodes/${id}`),
  create: (input: CreateKnowledgeNodeInput) => apiFetch<KnowledgeNodeDto>('/v1/knowledge/nodes', json(input)),
  remove: (id: string) => apiFetch<void>(`/v1/knowledge/nodes/${id}`, { method: 'DELETE' }),
  createEdge: (input: CreateKnowledgeEdgeInput) => apiFetch<KnowledgeEdgeDto>('/v1/knowledge/edges', json(input)),
};

export const curriculumApi = {
  list: () => apiFetch<Paginated<CurriculumDto>>(`/v1/curriculums${qs({ pageSize: 100 })}`),
  get: (id: string) => apiFetch<CurriculumDto>(`/v1/curriculums/${id}`),
  tree: (id: string) => apiFetch<CurriculumTreeNodeDto[]>(`/v1/curriculums/${id}/tree`),
  create: (input: CreateCurriculumInput) => apiFetch<CurriculumDto>('/v1/curriculums', json(input)),
  addNode: (curriculumId: string, input: CreateCurriculumNodeInput) =>
    apiFetch<CurriculumNodeDto>(`/v1/curriculums/${curriculumId}/nodes`, json(input)),
  setNodeKnowledge: (curriculumId: string, nodeId: string, input: SetCurriculumNodeKnowledgeInput) =>
    apiFetch<unknown>(`/v1/curriculums/${curriculumId}/nodes/${nodeId}/knowledge`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const examApi = {
  list: () => apiFetch<Paginated<ExamProfileDto>>(`/v1/exams${qs({ pageSize: 100 })}`),
  create: (input: CreateExamProfileInput) => apiFetch<ExamProfileDto>('/v1/exams', json(input)),
  setKnowledge: (examId: string, input: SetExamKnowledgeInput) =>
    apiFetch<unknown>(`/v1/exams/${examId}/knowledge`, { method: 'PUT', body: JSON.stringify(input) }),
  blueprints: (examId: string) => apiFetch<ExamBlueprintDto[]>(`/v1/exams/${examId}/blueprints`),
  createBlueprint: (examId: string, input: CreateExamBlueprintInput) =>
    apiFetch<ExamBlueprintDto>(`/v1/exams/${examId}/blueprints`, json(input)),
  addBlueprintItem: (examId: string, blueprintId: string, input: CreateExamBlueprintItemInput) =>
    apiFetch<unknown>(`/v1/exams/${examId}/blueprints/${blueprintId}/items`, json(input)),
  blueprintPlan: (examId: string, blueprintId: string) =>
    apiFetch<BlueprintPlanDto>(`/v1/exams/${examId}/blueprints/${blueprintId}/plan`),
};

export const trackApi = {
  list: () => apiFetch<Paginated<LearningTrackDto>>(`/v1/tracks${qs({ pageSize: 100 })}`),
  get: (id: string) => apiFetch<LearningTrackDetailDto>(`/v1/tracks/${id}`),
  create: (input: CreateLearningTrackInput) => apiFetch<LearningTrackDto>('/v1/tracks', json(input)),
  addModule: (trackId: string, input: CreateTrackModuleInput) =>
    apiFetch<TrackModuleDto>(`/v1/tracks/${trackId}/modules`, json(input)),
  setModuleKnowledge: (trackId: string, moduleId: string, input: SetTrackModuleKnowledgeInput) =>
    apiFetch<unknown>(`/v1/tracks/${trackId}/modules/${moduleId}/knowledge`, { method: 'PUT', body: JSON.stringify(input) }),
};

export const recommendationRuleApi = {
  list: () => apiFetch<Paginated<RecommendationRuleDto>>(`/v1/recommendation-rules${qs({ pageSize: 100 })}`),
  create: (input: CreateRecommendationRuleInput) =>
    apiFetch<RecommendationRuleDto>('/v1/recommendation-rules', json(input)),
  update: (id: string, input: UpdateRecommendationRuleInput) =>
    apiFetch<RecommendationRuleDto>(`/v1/recommendation-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => apiFetch<void>(`/v1/recommendation-rules/${id}`, { method: 'DELETE' }),
};
