import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

import { env } from './env.js';
import { scrapeRoutes } from './routes/scrape.js';
import { mediaRoutes } from './routes/media.js';
import { jobsRoutes } from './routes/jobs.js';

const app = Fastify({
  logger: process.env.NODE_ENV !== 'production' ? true : false,
  bodyLimit: 1_000_000, // 1MB
  
});

await app.register(cors, { origin: true });

await app.register(swagger, {
  openapi: {
    info: { title: 'Media Scraper API', version: '1.0.0' },
  },
});
await app.register(swaggerUI, { routePrefix: '/docs' });

await app.register(scrapeRoutes, { prefix: '/api' });
await app.register(mediaRoutes, { prefix: '/api' });
await app.register(jobsRoutes, { prefix: '/api' });

app.get('/health', async () => ({ ok: true }));

app.listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`API listening on :${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
