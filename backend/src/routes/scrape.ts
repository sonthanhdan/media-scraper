import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { scrapeQueue, SCRAPE_QUEUE_NAME } from '../queue.js';
import { env } from '../env.js';

const BodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1),
});

function normalizeUrl(u: string): string | null {
  try {
    const raw = u.trim();
    if (!raw) return null;
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function scrapeRoutes(app: FastifyInstance) {
  app.post('/scrape', {
    schema: {
      description: 'Create a scrape job for a list of URLs',
      body: {
        type: 'object',
        required: ['urls'],
        properties: {
          urls: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            accepted: { type: 'number' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, async (req, reply) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });

    const rawUrls = parsed.data.urls.slice(0, env.MAX_URLS_PER_REQUEST);
    const urls = rawUrls
      .map(normalizeUrl)
      .filter((x): x is string => Boolean(x));
    const uniqueUrls = Array.from(new Set(urls));

    if (uniqueUrls.length === 0) return reply.code(400).send({ error: 'No valid urls' });

    const job = await prisma.scrapeJob.create({
      data: { status: 'queued', totalTargets: uniqueUrls.length },
      select: { id: true }
    });

    await prisma.scrapeTarget.createMany({
      data: uniqueUrls.map((u) => ({ jobId: job.id, sourceUrl: u, status: 'queued' })),
    });

    // enqueue each target (use jobId + url, avoid extra DB fetch for IDs)
    await scrapeQueue.addBulk(
      uniqueUrls.map((u) => ({
        name: SCRAPE_QUEUE_NAME,
        data: { jobId: job.id, url: u }
      }))
    );

    return reply.send({ jobId: job.id, accepted: uniqueUrls.length });
  });
}
