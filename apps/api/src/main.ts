import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: false,
  });
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`API server running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
