import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Analytics e2e. Requires Postgres + Redis and a migrated + seeded DB. A student practices a
 * published question, then recomputes and reads their mastery.
 */
describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  const suffix = Date.now();
  let knowledgeNodeId = '';

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
      .send({ name: 'Student', email: `anstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;

    const node = await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(bearer(adminToken))
      .send({ code: `KNA_${suffix}`, name: 'Analytics Topic', type: 'CONCEPT' })
      .expect(201);
    knowledgeNodeId = node.body.id;

    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(bearer(adminToken))
      .send({
        questionCode: `QAN_${suffix}`,
        questionType: 'SINGLE_CHOICE',
        questionText: `Analytics question ${suffix}`,
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

    // Student practices the question so there is an answer to analyze.
    const sessionRes = await request(app.getHttpServer())
      .post('/api/v1/practice/sessions')
      .set(bearer(studentToken))
      .send({ knowledgeNodeIds: [knowledgeNodeId], count: 5 })
      .expect(201);
    const sq = sessionRes.body.questions[0];
    await request(app.getHttpServer())
      .post(`/api/v1/practice/sessions/${sessionRes.body.id}/answers`)
      .set(bearer(studentToken))
      .send({ sessionQuestionId: sq.sessionQuestionId, selectedOptionIds: [sq.options[0].id] })
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('recomputes mastery and reflects it in the dashboards', async () => {
    const recompute = await request(app.getHttpServer())
      .post('/api/v1/analytics/me/recompute-mastery')
      .set(bearer(studentToken))
      .expect(200);
    expect(recompute.body.nodes).toBeGreaterThanOrEqual(1);

    const mastery = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/mastery')
      .set(bearer(studentToken))
      .expect(200);
    expect(mastery.body.map((m: { knowledgeNodeId: string }) => m.knowledgeNodeId)).toContain(knowledgeNodeId);

    const overview = await request(app.getHttpServer())
      .get('/api/v1/analytics/me/overview')
      .set(bearer(studentToken))
      .expect(200);
    expect(overview.body.totalAnswered).toBeGreaterThanOrEqual(1);
  });

  it('gates topic metrics behind analytics:read (student 403, admin 200)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/analytics/topics/${knowledgeNodeId}`)
      .set(bearer(studentToken))
      .expect(403);

    const topic = await request(app.getHttpServer())
      .get(`/api/v1/analytics/topics/${knowledgeNodeId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(topic.body.knowledgeNodeId).toBe(knowledgeNodeId);
  });
});
