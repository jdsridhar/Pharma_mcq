import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Assessment e2e. Requires Postgres + Redis and a migrated + seeded DB. Admin publishes a
 * question and a FIXED mock test; a student attempts it, submits, and gets a ranked result.
 */
describe('Assessment (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  const suffix = Date.now();
  let mockTestId = '';
  let sessionId = '';

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
      .send({ name: 'Student', email: `astudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;

    // Publish a question.
    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(bearer(adminToken))
      .send({
        questionCode: `QA_${suffix}`,
        questionType: 'SINGLE_CHOICE',
        questionText: `Assessment question ${suffix}`,
        answerSpec: { type: 'SINGLE_CHOICE' },
        options: [
          { text: 'Right', isCorrect: true },
          { text: 'Wrong', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = q.body.id;
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/submit`).set(bearer(adminToken)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/approve`).set(bearer(adminToken)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/publish`).set(bearer(adminToken)).expect(201);

    // Create a FIXED mock test, attach the question, publish it.
    const mt = await request(app.getHttpServer())
      .post('/api/v1/mock-tests')
      .set(bearer(adminToken))
      .send({ code: `MT_${suffix}`, title: 'Mock 1', mode: 'FIXED', durationMinutes: 30, totalQuestions: 1 })
      .expect(201);
    mockTestId = mt.body.id;
    await request(app.getHttpServer())
      .put(`/api/v1/mock-tests/${mockTestId}/questions`)
      .set(bearer(adminToken))
      .send({ items: [{ questionId, marks: 4, negativeMarks: 1 }] })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/mock-tests/${mockTestId}`)
      .set(bearer(adminToken))
      .send({ status: 'PUBLISHED' })
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('starts an attempt and freezes snapshot questions (no correctness leaked)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/mock-tests/${mockTestId}/start`)
      .set(bearer(studentToken))
      .expect(201);
    sessionId = res.body.id;
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].options[0]).not.toHaveProperty('isCorrect');
    expect(res.body.expiresAt).not.toBeNull();
  });

  it('saves an answer then submits for a scored, ranked result', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/assessments/sessions/${sessionId}`)
      .set(bearer(studentToken))
      .expect(200);
    const snapshot = detail.body.questions[0];

    await request(app.getHttpServer())
      .post(`/api/v1/assessments/sessions/${sessionId}/answers`)
      .set(bearer(studentToken))
      .send({ snapshotId: snapshot.snapshotId, selectedOptionIds: [snapshot.options[0].id] })
      .expect(200);

    const result = await request(app.getHttpServer())
      .post(`/api/v1/assessments/sessions/${sessionId}/submit`)
      .set(bearer(studentToken))
      .expect(200);
    expect(result.body.maxScore).toBe(4);
    expect(typeof result.body.score).toBe('number');
    expect(result.body.rank).toBe(1);
    expect(result.body.cohortSize).toBeGreaterThanOrEqual(1);
  });
});
