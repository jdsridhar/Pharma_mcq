import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Curriculum e2e. Requires Postgres + Redis and a migrated + seeded DB (dev Super Admin
 * for curriculum:manage). Covers tree CRUD, node→knowledge and question→curriculum mapping.
 */
describe('Curriculum (e2e)', () => {
  let app: INestApplication;
  let token = '';
  const suffix = Date.now();
  let curriculumId = '';
  let rootId = '';
  let childId = '';
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
      .send({ code: `KNC_${suffix}`, name: 'Curriculum Topic', type: 'CONCEPT' })
      .expect(201);
    knowledgeNodeId = node.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates a curriculum and a node tree', async () => {
    const curriculum = await request(app.getHttpServer())
      .post('/api/v1/curriculums')
      .set(auth())
      .send({ code: `CUR_${suffix}`, name: 'B.Pharm Syllabus' })
      .expect(201);
    curriculumId = curriculum.body.id;

    const root = await request(app.getHttpServer())
      .post(`/api/v1/curriculums/${curriculumId}/nodes`)
      .set(auth())
      .send({ name: 'Semester 1', displayOrder: 0 })
      .expect(201);
    rootId = root.body.id;

    const child = await request(app.getHttpServer())
      .post(`/api/v1/curriculums/${curriculumId}/nodes`)
      .set(auth())
      .send({ name: 'Pharmaceutics', parentId: rootId, displayOrder: 0 })
      .expect(201);
    childId = child.body.id;
  });

  it('returns the nested tree', async () => {
    const tree = await request(app.getHttpServer())
      .get(`/api/v1/curriculums/${curriculumId}/tree`)
      .set(auth())
      .expect(200);
    expect(tree.body).toHaveLength(1);
    expect(tree.body[0].id).toBe(rootId);
    expect(tree.body[0].children[0].id).toBe(childId);
  });

  it('maps a curriculum node to a knowledge node', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/curriculums/${curriculumId}/nodes/${childId}/knowledge`)
      .set(auth())
      .send({ knowledgeNodeIds: [knowledgeNodeId] })
      .expect(200);
    expect(res.body.knowledgeNodeIds).toContain(knowledgeNodeId);
  });

  it('maps a question to a curriculum node and reflects it in the question detail', async () => {
    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(auth())
      .send({
        questionCode: `QC_${suffix}`,
        questionType: 'TRUE_FALSE',
        questionText: `Curriculum-mapped question ${suffix}`,
        answerSpec: { type: 'TRUE_FALSE', answer: true },
      })
      .expect(201);
    questionId = q.body.id;

    const mapped = await request(app.getHttpServer())
      .put(`/api/v1/questions/${questionId}/mappings/curriculum`)
      .set(auth())
      .send({ items: [{ curriculumNodeId: childId }] })
      .expect(200);
    expect(mapped.body.curriculumNodeIds).toContain(childId);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/questions/${questionId}`)
      .set(auth())
      .expect(200);
    expect(detail.body.curriculumNodeIds).toContain(childId);
  });

  it('refuses to delete a node that still has children (409), then deletes the leaf', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/curriculums/${curriculumId}/nodes/${rootId}`)
      .set(auth())
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/curriculums/${curriculumId}/nodes/${childId}`)
      .set(auth())
      .expect(204);
  });
});
