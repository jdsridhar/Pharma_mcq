import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Question lifecycle e2e. Requires Postgres + Redis and a migrated + seeded DB (the dev
 * Super Admin holds every question permission). pg_trgm/operational SQL not required here.
 */
describe('Questions (e2e)', () => {
  let app: INestApplication;
  let token = '';
  const suffix = Date.now();
  const code = `Q_E2E_${suffix}`;
  const text = `E2E unique question about pharmacology number ${suffix}`;
  let questionId = '';
  let nodeId = '';

  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@pharmacy-mcq.local';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe_Admin1';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    token = login.body.accessToken;

    const node = await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(auth())
      .send({ code: `KN_E2E_${suffix}`, name: 'E2E Topic', type: 'CONCEPT' })
      .expect(201);
    nodeId = node.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects an inconsistent answer (SINGLE_CHOICE with two correct options) — 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(auth())
      .send({
        questionCode: `${code}_BAD`,
        questionType: 'SINGLE_CHOICE',
        questionText: `${text} bad`,
        answerSpec: { type: 'SINGLE_CHOICE' },
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      })
      .expect(400);
  });

  it('creates a question in DRAFT', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(auth())
      .send({
        questionCode: code,
        questionType: 'SINGLE_CHOICE',
        questionText: text,
        answerSpec: { type: 'SINGLE_CHOICE' },
        options: [
          { text: 'Correct', isCorrect: true },
          { text: 'Wrong', isCorrect: false },
        ],
      })
      .expect(201);
    questionId = res.body.id;
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.workingVersion.versionNumber).toBe(1);
  });

  it('rejects a duplicate (identical text) — 409', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(auth())
      .send({
        questionCode: `${code}_DUP`,
        questionType: 'SINGLE_CHOICE',
        questionText: text,
        answerSpec: { type: 'SINGLE_CHOICE' },
        options: [
          { text: 'Correct', isCorrect: true },
          { text: 'Wrong', isCorrect: false },
        ],
      })
      .expect(409);
  });

  it('maps the question to a knowledge node', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/questions/${questionId}/mappings/knowledge`)
      .set(auth())
      .send({ items: [{ knowledgeNodeId: nodeId, weight: 0.8 }] })
      .expect(200);
    expect(res.body.knowledgeNodeIds).toContain(nodeId);
  });

  it('runs the review workflow: submit → approve → publish', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionId}/submit`)
      .set(auth())
      .expect(201)
      .expect((r) => expect(r.body.status).toBe('REVIEW'));

    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionId}/approve`)
      .set(auth())
      .expect(201)
      .expect((r) => expect(r.body.status).toBe('APPROVED'));

    const published = await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionId}/publish`)
      .set(auth())
      .expect(201);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.currentVersion).not.toBeNull();
    expect(published.body.knowledgeNodeIds).toContain(nodeId);
  });

  it('cannot approve an already-published question — 409', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionId}/approve`)
      .set(auth())
      .expect(409);
  });

  it('lists published questions including ours', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/questions?status=PUBLISHED')
      .set(auth())
      .expect(200);
    expect(res.body.items.map((q: { id: string }) => q.id)).toContain(questionId);
  });
});
