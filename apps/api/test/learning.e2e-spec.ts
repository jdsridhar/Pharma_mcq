import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Learning e2e. Requires Postgres + Redis and a migrated + seeded DB (dev Super Admin for
 * track:manage; progress is student-self). Covers tracks, modules, module→knowledge,
 * per-user progress and question→track mapping.
 */
describe('Learning (e2e)', () => {
  let app: INestApplication;
  let token = '';
  const suffix = Date.now();
  let trackId = '';
  let moduleId = '';
  let knowledgeNodeId = '';
  let questionId = '';

  const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@pharmacy-mcq.local';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe_Admin1';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    token = login.body.accessToken;

    const node = await request(app.getHttpServer())
      .post('/api/v1/knowledge/nodes')
      .set(auth())
      .send({ code: `KNL_${suffix}`, name: 'Learning Topic', type: 'CONCEPT' })
      .expect(201);
    knowledgeNodeId = node.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects a track referencing a non-existent exam profile (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tracks')
      .set(auth())
      .send({
        code: `TRKBAD_${suffix}`,
        name: 'Bad',
        examProfileId: '00000000-0000-0000-0000-0000000000aa',
      })
      .expect(400);
  });

  it('creates a track with a module', async () => {
    const track = await request(app.getHttpServer())
      .post('/api/v1/tracks')
      .set(auth())
      .send({ code: `TRK_${suffix}`, name: 'GPAT Crash Course' })
      .expect(201);
    trackId = track.body.id;

    const module = await request(app.getHttpServer())
      .post(`/api/v1/tracks/${trackId}/modules`)
      .set(auth())
      .send({ name: 'Week 1: Pharmacology', displayOrder: 0 })
      .expect(201);
    moduleId = module.body.id;
  });

  it('maps a module to a knowledge node', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/tracks/${trackId}/modules/${moduleId}/knowledge`)
      .set(auth())
      .send({ knowledgeNodeIds: [knowledgeNodeId] })
      .expect(200);
    expect(res.body.knowledgeNodeIds).toContain(knowledgeNodeId);
  });

  it('records and reads the current user’s progress', async () => {
    const set = await request(app.getHttpServer())
      .put(`/api/v1/tracks/${trackId}/modules/${moduleId}/progress`)
      .set(auth())
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(set.body.status).toBe('COMPLETED');
    expect(set.body.completedAt).not.toBeNull();

    const progress = await request(app.getHttpServer())
      .get(`/api/v1/tracks/${trackId}/progress`)
      .set(auth())
      .expect(200);
    const entry = progress.body.find((p: { trackModuleId: string }) => p.trackModuleId === moduleId);
    expect(entry.status).toBe('COMPLETED');
  });

  it('maps a question to a track module (reflected in the question detail)', async () => {
    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(auth())
      .send({
        questionCode: `QL_${suffix}`,
        questionType: 'TRUE_FALSE',
        questionText: `Track-mapped question ${suffix}`,
        answerSpec: { type: 'TRUE_FALSE', answer: false },
      })
      .expect(201);
    questionId = q.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/questions/${questionId}/mappings/tracks`)
      .set(auth())
      .send({ items: [{ trackModuleId: moduleId }] })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/questions/${questionId}`)
      .set(auth())
      .expect(200);
    expect(detail.body.trackModuleIds).toContain(moduleId);
  });
});
