import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { ServerEnv } from '@pharmacy/config';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { ThrottlerGuard } from './common/throttler/throttler.guard';
import { APP_ENV, AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RlsInterceptor } from './infra/prisma/rls.interceptor';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { ExamModule } from './modules/exam/exam.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { LearningModule } from './modules/learning/learning.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PracticeModule } from './modules/practice/practice.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { RevisionModule } from './modules/revision/revision.module';
import { QuestionModule } from './modules/question/question.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_ENV],
      useFactory: (env: ServerEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          autoLogging: true,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
              : undefined,
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    TenancyModule,
    QueueModule,
    HealthModule,
    // Domain modules (Identity, Knowledge, Question, ...) are registered here per phase.
    IdentityModule,
    KnowledgeModule,
    QuestionModule,
    CurriculumModule,
    ExamModule,
    LearningModule,
    PracticeModule,
    AssessmentModule,
    RevisionModule,
    AnalyticsModule,
    RecommendationModule,
    CommerceModule,
    NotificationModule,
    AdminModule,
  ],
  providers: [
    // Global rate limiter (Redis-backed, production-only). Bound at the root so it runs ahead
    // of the Identity guards; auth routes tighten it via `@Throttle`, health opts out.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Postgres RLS: wrap authenticated non-super requests in a tenant-scoped transaction.
    // Runs after the global guards, so `req.user` is populated.
    { provide: APP_INTERCEPTOR, useClass: RlsInterceptor },
  ],
})
export class AppModule {}
