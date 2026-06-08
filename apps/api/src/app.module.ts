import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { DatabaseModule } from './database/database.module';
import { IngestModule } from './ingest/ingest.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        ANTHROPIC_API_KEY: Joi.string().required(),
        OPENAI_API_KEY: Joi.string().required(),
        PORT: Joi.number().default(3001),
        DB_PATH: Joi.string().optional(),
        CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
      }),
      validationOptions: {
        // allowUnknown: true is REQUIRED — .env contains NEXT_PUBLIC_API_URL
        // which is not in the Joi schema; without this Joi rejects it (RESEARCH Pitfall 2)
        allowUnknown: true,
        // abortEarly: false reports ALL missing keys at once, not just the first (ENG-04)
        abortEarly: false,
      },
    }),
    DatabaseModule,
    IngestModule,
    AgentModule,
  ],
})
export class AppModule {}
