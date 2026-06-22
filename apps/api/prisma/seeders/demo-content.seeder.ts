import { normalizeQuestionText } from '@pharmacy/contracts';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

/**
 * Seeds a small set of PUBLISHED questions (+ a knowledge topic and a mock test) so the student
 * experience — practice, mock tests, analytics — works immediately on a fresh database.
 * DEV ONLY — skipped in production (or when SEED_DEMO_CONTENT=false). Idempotent.
 */

type QType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TRUE_FALSE' | 'NUMERIC';

interface SeedQuestion {
  code: string;
  type: QType;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  text: string;
  explanation?: string;
  answerSpec: Prisma.InputJsonValue;
  options?: { optionText: string; isCorrect: boolean; displayOrder: number }[];
}

const choice = (...opts: [string, boolean][]): SeedQuestion['options'] =>
  opts.map(([optionText, isCorrect], displayOrder) => ({ optionText, isCorrect, displayOrder }));

const QUESTIONS: SeedQuestion[] = [
  {
    code: 'DEMO-001',
    type: 'SINGLE_CHOICE',
    difficulty: 'EASY',
    text: 'Which vitamin is primarily synthesised in the skin on exposure to sunlight?',
    explanation: 'UVB light converts 7-dehydrocholesterol to vitamin D3 in the skin.',
    answerSpec: { type: 'SINGLE_CHOICE' },
    options: choice(['Vitamin D', true], ['Vitamin C', false], ['Vitamin K', false], ['Vitamin B12', false]),
  },
  {
    code: 'DEMO-002',
    type: 'SINGLE_CHOICE',
    difficulty: 'EASY',
    text: 'Which of the following drugs is a proton pump inhibitor?',
    explanation: 'Omeprazole irreversibly inhibits the H+/K+ ATPase of gastric parietal cells.',
    answerSpec: { type: 'SINGLE_CHOICE' },
    options: choice(['Omeprazole', true], ['Ranitidine', false], ['Loratadine', false], ['Atenolol', false]),
  },
  {
    code: 'DEMO-003',
    type: 'TRUE_FALSE',
    difficulty: 'EASY',
    text: 'Paracetamol (acetaminophen) has strong anti-inflammatory activity.',
    explanation: 'Paracetamol is an analgesic/antipyretic with only weak anti-inflammatory action.',
    answerSpec: { type: 'TRUE_FALSE', answer: false },
  },
  {
    code: 'DEMO-004',
    type: 'TRUE_FALSE',
    difficulty: 'EASY',
    text: 'Insulin is a peptide hormone.',
    explanation: 'Insulin is a 51-amino-acid peptide hormone produced by pancreatic beta cells.',
    answerSpec: { type: 'TRUE_FALSE', answer: true },
  },
  {
    code: 'DEMO-005',
    type: 'MULTI_CHOICE',
    difficulty: 'MEDIUM',
    text: 'Select all of the following that are beta-adrenergic blockers.',
    explanation: 'Atenolol, metoprolol and propranolol are beta-blockers; amlodipine is a calcium-channel blocker.',
    answerSpec: { type: 'MULTI_CHOICE' },
    options: choice(['Atenolol', true], ['Metoprolol', true], ['Propranolol', true], ['Amlodipine', false]),
  },
  {
    code: 'DEMO-006',
    type: 'SINGLE_CHOICE',
    difficulty: 'MEDIUM',
    text: 'The specific antidote for warfarin overdose is:',
    explanation: 'Vitamin K reverses warfarin by restoring synthesis of clotting factors II, VII, IX and X.',
    answerSpec: { type: 'SINGLE_CHOICE' },
    options: choice(['Vitamin K', true], ['Protamine sulfate', false], ['Naloxone', false], ['Flumazenil', false]),
  },
  {
    code: 'DEMO-007',
    type: 'NUMERIC',
    difficulty: 'MEDIUM',
    text: 'What is the usual upper limit of a normal fasting blood-glucose level, in mg/dL?',
    explanation: 'Fasting plasma glucose is considered normal below ~100 mg/dL.',
    answerSpec: { type: 'NUMERIC', value: 100, tolerance: 6 },
  },
  {
    code: 'DEMO-008',
    type: 'SINGLE_CHOICE',
    difficulty: 'EASY',
    text: 'Amoxicillin belongs to which class of antibiotics?',
    explanation: 'Amoxicillin is an aminopenicillin (a beta-lactam penicillin).',
    answerSpec: { type: 'SINGLE_CHOICE' },
    options: choice(['Penicillins', true], ['Macrolides', false], ['Fluoroquinolones', false], ['Tetracyclines', false]),
  },
];

export async function seedDemoContent(prisma: PrismaClient, createdById?: string): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO_CONTENT === 'false') {
    // eslint-disable-next-line no-console
    console.log('[seed] demo content skipped (production or SEED_DEMO_CONTENT=false)');
    return;
  }

  const already = await prisma.question.count({ where: { questionCode: { startsWith: 'DEMO-' } } });
  if (already > 0) {
    // eslint-disable-next-line no-console
    console.log(`[seed] demo content already present (${already} questions) — skipping`);
    return;
  }

  const node = await prisma.knowledgeNode.upsert({
    where: { code: 'DEMO-PHARMA' },
    update: {},
    create: { code: 'DEMO-PHARMA', name: 'Pharmacology Basics', type: 'DOMAIN', description: 'Demo topic for the sample question bank' },
  });

  const questionIds: string[] = [];
  for (const q of QUESTIONS) {
    const hash = createHash('sha256').update(normalizeQuestionText(q.text)).digest('hex');
    const created = await prisma.question.create({
      data: {
        questionCode: q.code,
        questionType: q.type,
        authorDifficulty: q.difficulty,
        language: 'en',
        status: 'PUBLISHED',
        normalizedTextHash: hash,
        createdById,
        versions: {
          create: {
            versionNumber: 1,
            questionText: q.text,
            explanation: q.explanation,
            answerSpec: q.answerSpec,
            normalizedTextHash: hash,
            status: 'PUBLISHED',
            createdById,
            ...(q.options ? { options: { create: q.options } } : {}),
          },
        },
        knowledgeMappings: { create: { knowledgeNodeId: node.id, weight: 1 } },
      },
      include: { versions: { select: { id: true } } },
    });
    const version = created.versions[0];
    if (version) {
      await prisma.question.update({ where: { id: created.id }, data: { currentVersionId: version.id } });
    }
    questionIds.push(created.id);
  }

  await prisma.mockTest.create({
    data: {
      code: 'DEMO-MT-1',
      title: 'Demo Mock Test — Pharmacology Basics',
      description: 'A short, timed sample test seeded for the demo.',
      mode: 'FIXED',
      durationMinutes: 15,
      totalQuestions: questionIds.length,
      status: 'PUBLISHED',
      createdById,
      questions: {
        create: questionIds.map((questionId, i) => ({ questionId, displayOrder: i, marks: 1, negativeMarks: 0 })),
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed] demo content ready: ${questionIds.length} published questions, 1 topic, 1 mock test`);
}
