import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Knowledge graph e2e. Requires Postgres + Redis up and a migrated + seeded DB. Uses the
 * dev Super Admin (admin@pharmacy-mcq.local / ChangeMe_Admin1) for knowledge:manage; set
 * SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD env to override.
 */
describe('Knowledge (e2e)', () => {
  let app: INestApplication;
  let adminToken = '';
  let studentToken = '';
  const suffix = Date.now();
  const codeA = `E2E_A_${suffix}`;
  const codeB = `E2E_B_${suffix}`;
  let nodeAId = '';
  let nodeBId = '';

  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@pharmacy-mcq.local';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe_Admin1';

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
      .send({ name: 'Student', email: `kstudent_${suffix}@e2e.local`, password: 'E2ePassw0rd!' })
      .expect(201);
    studentToken = student.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('forbids a student (knowledge:read only) from creating a node (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(auth(studentToken))
      .send({ code: codeA, name: 'Should fail', type: 'DOMAIN' })
      .expect(403);
  });

  it('creates two nodes as admin', async () => {
    const a = await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(auth(adminToken))
      .send({ code: codeA, name: 'Pharmacology', type: 'DOMAIN' })
      .expect(201);
    nodeAId = a.body.id;

    const b = await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(auth(adminToken))
      .send({ code: codeB, name: 'NSAIDs', type: 'CONCEPT' })
      .expect(201);
    nodeBId = b.body.id;
  });

  it('rejects a duplicate code (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(auth(adminToken))
      .send({ code: codeA, name: 'Dup', type: 'DOMAIN' })
      .expect(409);
  });

  it('creates a hierarchical edge A → B', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/knowledge/edges')
      .set(auth(adminToken))
      .send({ parentNodeId: nodeAId, childNodeId: nodeBId, relationshipType: 'PART_OF' })
      .expect(201);
  });

  it('rejects the reverse edge B → A as a cycle (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/knowledge/edges')
      .set(auth(adminToken))
      .send({ parentNodeId: nodeBId, childNodeId: nodeAId, relationshipType: 'PART_OF' })
      .expect(409);
  });

  it('lists descendants of A (includes B) and ancestors of B (includes A)', async () => {
    const desc = await request(app.getHttpServer())
      .get(`/api/v1/knowledge/nodes/${nodeAId}/descendants`)
      .set(auth(studentToken))
      .expect(200);
    expect(desc.body.map((n: { id: string }) => n.id)).toContain(nodeBId);

    const anc = await request(app.getHttpServer())
      .get(`/api/v1/knowledge/nodes/${nodeBId}/ancestors`)
      .set(auth(studentToken))
      .expect(200);
    expect(anc.body.map((n: { id: string }) => n.id)).toContain(nodeAId);
  });

  it('filters the node list by search', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/knowledge/nodes?search=${codeA}`)
      .set(auth(studentToken))
      .expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.meta).toHaveProperty('total');
  });
});
