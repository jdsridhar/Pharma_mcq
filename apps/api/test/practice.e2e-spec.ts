import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Practice e2e. Requires Postgres + Redis (BullMQ) and a migrated + seeded DB. The admin
 * publishes a question; a student practices it.
 */
describe('Practice (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  let otherToken = '';
  const suffix = Date.now();
  let knowledgeNodeId = '';
  let sessionId = '';
  let firstSessionQuestionId = '';
  let firstOptionId = '';

  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@pharmacy-mcq.local';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe_Admin1';
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    const admin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminToken = admin.body.accessToken;

    const student = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Student', email: `pstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;

    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Other', email: `pother_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    otherToken = other.body.accessToken;

    // Author + publish a question mapped to a knowledge node.
    const node = await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(bearer(adminToken))
      .send({ code: `KNP_${suffix}`, name: 'Practice Topic', type: 'CONCEPT' })
      .expect(201);
    knowledgeNodeId = node.body.id;

    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(bearer(adminToken))
      .send({
        questionCode: `QP_${suffix}`,
        questionType: 'SINGLE_CHOICE',
        questionText: `Practice question ${suffix}`,
        explanation: 'Because reasons.',
        answerSpec: { type: 'SINGLE_CHOICE' },
        options: [
          { text: 'Right', isCorrect: true },
          { text: 'Wrong', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = q.body.id;
    await request(app.getHttpServer())
      .put(`/api/v1/questions/${questionId}/mappings/knowledge`)
      .set(bearer(adminToken))
      .send({ items: [{ knowledgeNodeId }] })
      .expect(200);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/submit`).set(bearer(adminToken)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/approve`).set(bearer(adminToken)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/publish`).set(bearer(adminToken)).expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('starts a practice session and serves questions without leaking correctness', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/practice/sessions')
      .set(bearer(studentToken))
      .send({ knowledgeNodeIds: [knowledgeNodeId], count: 5 })
      .expect(201);
    sessionId = res.body.id;
    expect(res.body.questions.length).toBeGreaterThanOrEqual(1);
    const first = res.body.questions[0];
    firstSessionQuestionId = first.sessionQuestionId;
    firstOptionId = first.options[0].id;
    // Served options must not expose the answer key.
    expect(first.options[0]).not.toHaveProperty('isCorrect');
  });

  it('forbids another user from viewing the session (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/practice/sessions/${sessionId}`)
      .set(bearer(otherToken))
      .expect(403);
  });

  it('accepts an answer and returns feedback', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/practice/sessions/${sessionId}/answers`)
      .set(bearer(studentToken))
      .send({ sessionQuestionId: firstSessionQuestionId, selectedOptionIds: [firstOptionId], timeMs: 1500 })
      .expect(200);
    expect(typeof res.body.isCorrect).toBe('boolean');
    expect(res.body.explanation).toBe('Because reasons.');
    expect(Array.isArray(res.body.correctOptionIds)).toBe(true);
  });

  it('completes the session and returns a summary', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/practice/sessions/${sessionId}/complete`)
      .set(bearer(studentToken))
      .expect(200);
    expect(res.body.answered).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('accuracy');
  });
});
