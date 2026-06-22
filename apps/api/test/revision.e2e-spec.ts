import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Revision e2e. Requires Postgres + Redis and a migrated + seeded DB. Admin publishes a
 * question; a student queues it and reviews it.
 */
describe('Revision (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  const suffix = Date.now();
  let questionId = '';
  let itemId = '';

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
      .send({ name: 'Student', email: `rstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;

    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(bearer(adminToken))
      .send({
        questionCode: `QR_${suffix}`,
        questionType: 'TRUE_FALSE',
        questionText: `Revision question ${suffix}`,
        answerSpec: { type: 'TRUE_FALSE', answer: true },
      })
      .expect(201);
    questionId = q.body.id;
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/submit`).set(bearer(adminToken)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/approve`).set(bearer(adminToken)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/questions/${questionId}/publish`).set(bearer(adminToken)).expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('adds a question to the revision queue', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/revision/items')
      .set(bearer(studentToken))
      .send({ questionId, source: 'BOOKMARK' })
      .expect(201);
    itemId = res.body.id;
    expect(res.body.status).toBe('PENDING');
    expect(res.body.reviewCount).toBe(0);
  });

  it('rejects adding an unpublished/unknown question (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/revision/items')
      .set(bearer(studentToken))
      .send({ questionId: '00000000-0000-0000-0000-0000000000aa' })
      .expect(400);
  });

  it('records a correct review and advances the schedule', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/revision/items/${itemId}/review`)
      .set(bearer(studentToken))
      .send({ outcome: 'CORRECT' })
      .expect(200);
    expect(res.body.reviewCount).toBe(1);
    expect(res.body.dueAt).not.toBeNull();
  });

  it('lists the queue', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/revision/queue')
      .set(bearer(studentToken))
      .expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toContain(itemId);
  });
});
