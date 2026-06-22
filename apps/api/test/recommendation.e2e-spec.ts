import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Recommendation e2e. Requires Postgres + Redis and a migrated + seeded DB. Covers the
 * student feed/plan and Admin-only rule management.
 */
describe('Recommendation (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  const suffix = Date.now();

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
      .send({ name: 'Student', email: `recstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('builds a study plan for the student', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/me/study-plan')
      .set(bearer(studentToken))
      .send({ days: 3, dailyQuestions: 9 })
      .expect(200);
    expect(res.body.days).toHaveLength(3);
    expect(res.body.totalQuestions).toBe(27);
  });

  it('returns weak areas and a generated feed (arrays)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/recommendations/me/weak-areas')
      .set(bearer(studentToken))
      .expect(200)
      .expect((r) => expect(Array.isArray(r.body)).toBe(true));

    await request(app.getHttpServer())
      .post('/api/v1/recommendations/me/generate')
      .set(bearer(studentToken))
      .expect(200)
      .expect((r) => expect(Array.isArray(r.body)).toBe(true));
  });

  it('restricts rule management to admins', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/recommendation-rules')
      .set(bearer(studentToken))
      .send({ code: `R_${suffix}`, name: 'Rule', definition: { type: 'REVISE_DUE' } })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/api/v1/recommendation-rules')
      .set(bearer(adminToken))
      .send({ code: `R_${suffix}`, name: 'Revise due', definition: { type: 'REVISE_DUE' }, priority: 90 })
      .expect(201);
    expect(created.body.code).toBe(`R_${suffix}`);

    await request(app.getHttpServer())
      .get('/api/v1/recommendation-rules')
      .set(bearer(adminToken))
      .expect(200)
      .expect((r) => expect(r.body.items.length).toBeGreaterThanOrEqual(1));
  });
});
