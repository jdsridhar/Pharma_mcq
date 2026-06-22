import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Admin e2e. Requires Postgres + Redis and a migrated + seeded DB. Covers user/role admin,
 * audit logging and the review queue. Uses the dev Super Admin.
 */
describe('Admin (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  let studentId = '';
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
      .send({ name: 'Admin Test Student', email: `adstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;
    studentId = student.body.user.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('forbids non-admins from the admin API (403)', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/users').set(bearer(studentToken)).expect(403);
  });

  it('lists users and assigns a role', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/users?search=adstudent_${suffix}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(list.body.items.map((u: { id: string }) => u.id)).toContain(studentId);

    const roles = await request(app.getHttpServer())
      .get('/api/v1/admin/roles')
      .set(bearer(adminToken))
      .expect(200);
    const reviewerRole = roles.body.find((r: { name: string }) => r.name === 'Reviewer');
    expect(reviewerRole).toBeDefined();

    const updated = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${studentId}/roles`)
      .set(bearer(adminToken))
      .send({ roleId: reviewerRole.id })
      .expect(201);
    expect(updated.body.roles).toContain('Reviewer');
  });

  it('exposes the review queue and audit log', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/review-queue')
      .set(bearer(adminToken))
      .expect(200)
      .expect((r) => expect(Array.isArray(r.body.items)).toBe(true));

    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set(bearer(adminToken))
      .expect(200)
      .expect((r) => expect(Array.isArray(r.body.items)).toBe(true));
  });
});
