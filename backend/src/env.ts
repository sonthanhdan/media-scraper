import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SCRAPE_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(25),
  FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  MAX_URLS_PER_REQUEST: z.coerce.number().int().min(1).max(200).default(50),
});

export const env = EnvSchema.parse(process.env);
