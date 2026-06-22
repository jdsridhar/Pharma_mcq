import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Full auth flow against a live stack. Requires Postgres + Redis up AND a migrated +
 * seeded DB (default organization + system roles): `pnpm db:migrate:deploy && pnpm db:seed`.
 * In CI these run before the e2e job.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `auth_${Date.now()}@e2e.local`;
  const password = 'E2ePassw0rd!';
  let accessToken = '';
  let loginCookies: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects registration with a weak password (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: `weak_${Date.now()}@e2e.local`, password: 'short' })
      .expect(400);
  });

  it('registers a new account and returns an access token + Student role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'E2E User', email, password })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.roles).toContain('Student');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects duplicate registration (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'E2E User', email, password })
      .expect(409);
  });

  it('logs in and sets a refresh cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    accessToken = res.body.accessToken;
    loginCookies = res.headers['set-cookie'] as unknown as string[];
    expect(accessToken).toBeTruthy();
    expect(loginCookies.join(';')).toContain('pmcq_refresh');
  });

  it('rejects bad credentials (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassw0rd!' })
      .expect(401);
  });

  it('returns the current user from /auth/me with a bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(email);
    expect(Array.isArray(res.body.permissions)).toBe(true);
  });

  it('rejects /auth/me without a token (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('rotates the refresh token via cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', loginCookies)
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeDefined();
  });
});
