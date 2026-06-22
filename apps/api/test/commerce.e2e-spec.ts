import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Commerce e2e. Requires Postgres + Redis and a migrated + seeded DB. With no Razorpay creds
 * the Manual adapter is bound, so a subscription activates immediately (no external gateway).
 */
describe('Commerce (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  const suffix = Date.now();
  const featureKey = `feat_${suffix}`;
  let planId = '';
  let planPriceId = '';

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
      .send({ name: 'Student', email: `cstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('admin builds the catalog (plan + price + feature)', async () => {
    const plan = await request(app.getHttpServer())
      .post('/api/v1/commerce/plans')
      .set(bearer(adminToken))
      .send({ code: `PRO_${suffix}`, name: 'Pro' })
      .expect(201);
    planId = plan.body.id;

    const price = await request(app.getHttpServer())
      .post(`/api/v1/commerce/plans/${planId}/prices`)
      .set(bearer(adminToken))
      .send({ billingInterval: 'MONTHLY', amountMinor: 49900, currency: 'INR' })
      .expect(201);
    planPriceId = price.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/commerce/features')
      .set(bearer(adminToken))
      .send({ key: featureKey, name: 'Unlimited mock tests' })
      .expect(201);

    const withFeatures = await request(app.getHttpServer())
      .put(`/api/v1/commerce/plans/${planId}/features`)
      .set(bearer(adminToken))
      .send({ items: [{ featureKey, limit: null }] })
      .expect(200);
    expect(withFeatures.body.features.map((f: { key: string }) => f.key)).toContain(featureKey);
  });

  it('exposes active plans publicly and forbids student management', async () => {
    const plans = await request(app.getHttpServer()).get('/api/v1/commerce/plans').expect(200);
    expect(plans.body.map((p: { id: string }) => p.id)).toContain(planId);

    await request(app.getHttpServer())
      .post('/api/v1/commerce/plans')
      .set(bearer(studentToken))
      .send({ code: `X_${suffix}`, name: 'Nope' })
      .expect(403);
  });

  it('subscribes a student (manual capture → ACTIVE) and reflects entitlements', async () => {
    const checkout = await request(app.getHttpServer())
      .post('/api/v1/commerce/subscriptions')
      .set(bearer(studentToken))
      .send({ planPriceId })
      .expect(201);
    expect(checkout.body.status).toBe('ACTIVE');
    expect(checkout.body.subscription).not.toBeNull();

    const entitlements = await request(app.getHttpServer())
      .get('/api/v1/commerce/me/entitlements')
      .set(bearer(studentToken))
      .expect(200);
    expect(entitlements.body.plan.code).toBe(`PRO_${suffix}`);
    expect(entitlements.body.features.map((f: { key: string }) => f.key)).toContain(featureKey);

    const subs = await request(app.getHttpServer())
      .get('/api/v1/commerce/me/subscriptions')
      .set(bearer(studentToken))
      .expect(200);
    expect(subs.body.length).toBeGreaterThanOrEqual(1);
  });
});
