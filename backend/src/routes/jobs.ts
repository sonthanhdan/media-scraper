import { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function jobsRoutes(app: FastifyInstance) {
  app.get('/jobs/:id', async (req, reply) => {
    const id = (req.params as any).id as string;

    const job = await prisma.scrapeJob.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        totalTargets: true,
        doneTargets: true,
        failedTargets: true
      }
    });

    if (!job) return reply.code(404).send({ error: 'Not found' });
    return reply.send(job);
  });

  app.get('/jobs/:id/stream', async (req, reply) => {
    const id = (req.params as any).id as string;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const send = async () => {
      const job = await prisma.scrapeJob.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          createdAt: true,
          totalTargets: true,
          doneTargets: true,
          failedTargets: true
        }
      });

      if (!job) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: 'Not found' })}\n\n`);
        reply.raw.end();
        return true;
      }

      reply.raw.write(`event: progress\ndata: ${JSON.stringify(job)}\n\n`);
      if (job.status === 'done' || job.status === 'failed') {
        reply.raw.end();
        return true;
      }
      return false;
    };

    const interval = setInterval(() => {
      void send().catch((err) => {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: err?.message ?? 'unknown error' })}\n\n`);
        reply.raw.end();
      });
    }, 1000);

    const closed = () => {
      clearInterval(interval);
    };

    req.raw.on('close', closed);
    req.raw.on('end', closed);

    await send();

    return reply;
  });
}
