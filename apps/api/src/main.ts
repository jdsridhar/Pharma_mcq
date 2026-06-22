import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadServerEnv } from '@pharmacy/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/validation/zod-validation.pipe';

async function bootstrap(): Promise<void> {
  const env = loadServerEnv();
  // rawBody: true exposes req.rawBody for HMAC webhook signature verification (Commerce).
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Structured logging via pino.
  app.useLogger(app.get(PinoLogger));

  // Security headers + CORS for the web app.
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.APP_WEB_URL, credentials: true });

  // /api/v1/... with version-neutral exceptions (e.g. /api/health).
  app.setGlobalPrefix(env.API_GLOBAL_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Validation (Zod) + canonical error envelope.
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Graceful shutdown (closes Prisma/Redis connections via lifecycle hooks).
  app.enableShutdownHooks();

  // OpenAPI docs at /api/docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pharmacy MCQ Platform API')
    .setDescription('Enterprise Pharmacy MCQ Platform — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${env.API_GLOBAL_PREFIX}/docs`, app, document);

  await app.listen(env.API_PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${env.API_PORT}/${env.API_GLOBAL_PREFIX}`);
  logger.log(`Swagger UI at http://localhost:${env.API_PORT}/${env.API_GLOBAL_PREFIX}/docs`);
}

void bootstrap();
