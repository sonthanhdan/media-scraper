import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

function expandSearchToken(token: string): string[] {
  const trimmed = token.trim();
  if (!trimmed) return [];
  const out = new Set<string>();
  out.add(trimmed);

  const noScheme = trimmed.replace(/^https?:\/\//i, '');
  if (noScheme !== trimmed) out.add(noScheme);

  if (trimmed.endsWith('/')) out.add(trimmed.replace(/\/+$/, ''));
  if (noScheme.endsWith('/')) out.add(noScheme.replace(/\/+$/, ''));

  return Array.from(out);
}

function buildSearchFilter(search: string | undefined) {
  const raw = (search ?? '').trim();
  if (!raw) return null;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const and: any[] = [];
  for (const token of tokens) {
    const variants = expandSearchToken(token);
    const or: any[] = [];
    for (const v of variants) {
      or.push({ sourceUrl: { contains: v, mode: 'insensitive' } });
      or.push({ mediaUrl: { contains: v, mode: 'insensitive' } });
    }
    if (or.length) and.push({ OR: or });
  }

  if (!and.length) return null;
  return and.length === 1 ? and[0] : { AND: and };
}

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  type: z.enum(['all', 'image', 'video']).default('all'),
  search: z.string().optional().default(''),
});

export async function mediaRoutes(app: FastifyInstance) {
  app.delete('/media', async (_req, reply) => {
    await prisma.mediaItem.deleteMany();
    await prisma.scrapeTarget.deleteMany();
    await prisma.scrapeJob.deleteMany();
    return reply.send({ ok: true });
  });

  app.get('/media', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query' });

    const { page, limit, type, search } = parsed.data;
    const skip = (page - 1) * limit;

    const and: any[] = [];
    if (type !== 'all') and.push({ type });
    const searchFilter = buildSearchFilter(search);
    if (searchFilter) and.push(searchFilter);
    const where: any = and.length ? { AND: and } : {};

    const [total, items] = await Promise.all([
      prisma.mediaItem.count({ where }),
      prisma.mediaItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          sourceUrl: true,
          mediaUrl: true,
          createdAt: true
        }
      })
    ]);

    return reply.send({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  });

  app.get('/media/stream', async (req, reply) => {
    const StreamSchema = z.object({
      jobId: z.string().min(1).optional(),
      type: z.enum(['all', 'image', 'video']).default('all'),
      search: z.string().optional().default(''),
    });

    const parsed = StreamSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query' });

    const { jobId, type, search } = parsed.data;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    let lastCreatedAt: Date | null = null;

    const buildWhere = () => {
      const and: any[] = [];
      if (jobId) and.push({ jobId });
      if (type !== 'all') and.push({ type });
      const searchFilter = buildSearchFilter(search);
      if (searchFilter) and.push(searchFilter);
      if (lastCreatedAt) {
        and.push({ createdAt: { gt: lastCreatedAt } });
      }
      return and.length ? { AND: and } : {};
    };

    const send = async () => {
      const items = await prisma.mediaItem.findMany({
        where: buildWhere(),
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: {
          id: true,
          type: true,
          sourceUrl: true,
          mediaUrl: true,
          createdAt: true
        }
      });

      if (items.length > 0) {
        lastCreatedAt = items[items.length - 1]?.createdAt ?? lastCreatedAt;
        reply.raw.write(`event: media\ndata: ${JSON.stringify(items)}\n\n`);
      } else {
        reply.raw.write(`event: ping\ndata: {}\n\n`);
      }
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
