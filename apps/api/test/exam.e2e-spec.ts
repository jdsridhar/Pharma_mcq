import { type INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

/**
 * Exam e2e. Requires Postgres + Redis and a migrated + seeded DB (dev Super Admin for
 * exam:manage). Covers profile, blueprint, weighted items (budget guard), exam↔knowledge
 * and question↔exam mappings.
 */
describe('Exams (e2e)', () => {
  let app: INestApplication;
  let token = '';
  const suffix = Date.now();
  let examId = '';
  let blueprintId = '';
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
      .send({ code: `KNE_${suffix}`, name: 'Exam Topic', type: 'CONCEPT' })
      .expect(201);
    knowledgeNodeId = node.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates an exam profile and maps knowledge', async () => {
    const exam = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set(auth())
      .send({ code: `EX_${suffix}`, name: 'GPAT' })
      .expect(201);
    examId = exam.body.id;

    const mapped = await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/knowledge`)
      .set(auth())
      .send({ items: [{ knowledgeNodeId, importance: 0.9 }] })
      .expect(200);
    expect(mapped.body.items.map((m: { knowledgeNodeId: string }) => m.knowledgeNodeId)).toContain(
      knowledgeNodeId,
    );
  });

  it('creates a blueprint and enforces the 100% weight budget', async () => {
    const bp = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/blueprints`)
      .set(auth())
      .send({ name: 'Full Mock', totalQuestions: 125, durationMinutes: 180 })
      .expect(201);
    blueprintId = bp.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/blueprints/${blueprintId}/items`)
      .set(auth())
      .send({ label: 'Pharmacology', weightPercent: 60, questionCount: 75 })
      .expect(201);

    // 60 + 50 = 110 → rejected
    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/blueprints/${blueprintId}/items`)
      .set(auth())
      .send({ label: 'Pharmaceutics', weightPercent: 50, questionCount: 60 })
      .expect(400);

    // 60 + 40 = 100 → accepted
    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/blueprints/${blueprintId}/items`)
      .set(auth())
      .send({
        label: 'Pharmaceutics',
        weightPercent: 40,
        questionCount: 50,
        difficultyMix: { EASY: 20, MEDIUM: 20, HARD: 10 },
        knowledgeNodeId,
      })
      .expect(201);

    const blueprint = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/blueprints/${blueprintId}`)
      .set(auth())
      .expect(200);
    expect(blueprint.body.items).toHaveLength(2);
  });

  it('maps a question to the exam profile (reflected in the question detail)', async () => {
    const q = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set(auth())
      .send({
        questionCode: `QE_${suffix}`,
        questionType: 'NUMERIC',
        questionText: `Exam-mapped numeric question ${suffix}`,
        answerSpec: { type: 'NUMERIC', value: 42, tolerance: 0.5 },
      })
      .expect(201);
    questionId = q.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/questions/${questionId}/mappings/exams`)
      .set(auth())
      .send({ items: [{ examProfileId: examId, relevance: 1 }] })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/questions/${questionId}`)
      .set(auth())
      .expect(200);
    expect(detail.body.examProfileIds).toContain(examId);
  });
});
