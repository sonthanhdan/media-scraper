import { Queue } from 'bullmq';
import { env } from './env.js';

export const SCRAPE_QUEUE_NAME = 'scrape';

export const scrapeQueue = new Queue(SCRAPE_QUEUE_NAME, {
  connection: { url: env.REDIS_URL },
});
