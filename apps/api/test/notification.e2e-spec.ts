import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Notification e2e. Requires Postgres + Redis. An admin sends a notification to a student,
 * who sees it in the in-app feed and marks it read.
 */
describe('Notification (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  let studentId = '';
  let notificationId = '';
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
      .send({ name: 'Student', email: `nstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;
    studentId = student.body.user.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('admin sends an in-app notification to the student', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/notifications')
      .set(bearer(adminToken))
      .send({
        userId: studentId,
        channel: 'PUSH',
        template: 'announcement',
        payload: { subject: 'Welcome', body: 'New mock tests are live!' },
      })
      .expect(201);
    notificationId = res.body.id;
    expect(res.body.title).toBe('Welcome');
    expect(res.body.body).toContain('mock tests');
  });

  it('forbids a student from sending notifications (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications')
      .set(bearer(studentToken))
      .send({ userId: studentId, channel: 'PUSH', template: 'announcement', payload: {} })
      .expect(403);
  });

  it('shows the notification in the student feed and marks it read', async () => {
    const feed = await request(app.getHttpServer())
      .get('/api/v1/notifications/me')
      .set(bearer(studentToken))
      .expect(200);
    expect(feed.body.items.map((n: { id: string }) => n.id)).toContain(notificationId);

    const read = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set(bearer(studentToken))
      .expect(200);
    expect(read.body.readAt).not.toBeNull();
  });
});
