import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Read config via ConfigService — env vars are now validated by Joi at startup (ENG-04, ENG-05)
  const config = app.get(ConfigService);

  app.enableShutdownHooks();
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: false,
  });

  // Global ValidationPipe: converts plain objects to DTO class instances and validates
  // transform: true — enables @Type() decorator to convert nested plain objects
  // whitelist: true — strips unknown properties from request bodies
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Global exception filter: normalizes all unhandled errors to { statusCode, message, error }
  // No stack traces in the response body (ENG-02 / T-05-06)
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
  Logger.log(`API server running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
