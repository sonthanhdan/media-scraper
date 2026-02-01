import { Job, Worker } from 'bullmq';
import { env } from '../env.js';
import { SCRAPE_QUEUE_NAME } from '../queue.js';
import { prisma } from '../db.js';
import { fetchHtml } from '../scraper/fetchHtml.js';
import { extractMedia } from '../scraper/extract.js';

type JobData = { jobId: string; url: string };

async function incJobProgress(jobId: string, ok: boolean) {
  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: ok
      ? { doneTargets: { increment: 1 } }
      : { failedTargets: { increment: 1 } },
  });

  const j = await prisma.scrapeJob.findUnique({
    where: { id: jobId },
    select: { totalTargets: true, doneTargets: true, failedTargets: true }
  });

  if (!j) return;

  const finished = j.doneTargets + j.failedTargets;
  if (finished >= j.totalTargets) {
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: j.failedTargets > 0 ? 'failed' : 'done' }
    });
  } else {
    await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'processing' } });
  }
}

const worker = new Worker<JobData>(
  SCRAPE_QUEUE_NAME,
  async (job: Job<JobData>) => {
    const { jobId, url } = job.data;

    await prisma.scrapeTarget.updateMany({
      where: { jobId, sourceUrl: url },
      data: { status: 'processing' }
    });

    try {
      const html = await fetchHtml(url);
      const items = extractMedia(html, url);

      if (items.length) {
        // insert many, skip duplicates by catching unique errors one-by-one is slow;
        // Prisma doesn't have "skipDuplicates" for Postgres createMany? It does.
        await prisma.mediaItem.createMany({
          data: items.map((it) => ({
            jobId,
            sourceUrl: url,
            mediaUrl: it.mediaUrl,
            type: it.type
          })),
          skipDuplicates: true
        });
      }

      await prisma.scrapeTarget.updateMany({
        where: { jobId, sourceUrl: url },
        data: { status: 'done', error: null }
      });

      await incJobProgress(jobId, true);
      return { inserted: items.length };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'unknown error';

      await prisma.scrapeTarget.updateMany({
        where: { jobId, sourceUrl: url },
        data: { status: 'failed', error: msg }
      });

      await incJobProgress(jobId, false);
      throw e;
    }
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: env.SCRAPE_CONCURRENCY
  }
);

worker.on('failed', (job, err) => {
  console.error('Job failed', job?.id, err?.message);
});

console.log(`Worker running. concurrency=${env.SCRAPE_CONCURRENCY}`);
