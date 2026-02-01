# Media Scraper (Node.js + React + PostgreSQL + Redis)

A lightweight media scraping system:
- Accepts a list of web URLs
- Scrapes image and video URLs from each page (HTML parsing)
- Stores results in PostgreSQL
- Provides a React UI to browse media with pagination, type filter, and search
- Handles high concurrent intake by enqueueing jobs and scraping asynchronously
- Fully dockerized via Docker Compose
- Includes a load test script (k6)

---

## Tech Stack

Backend:
- Node.js + TypeScript
- Fastify
- Prisma ORM
- BullMQ + Redis (job queue)

Frontend:
- React + TypeScript (Vite)

Load test:
- k6

---

## Architecture Overview

Designed for high concurrent request intake under limited resources (1 CPU / 1GB RAM).

Flow:
1. Client calls `POST /api/scrape` with an array of URLs
2. API validates input, creates a `scrape_job` and `scrape_targets` in DB
3. API enqueues one queue job per target URL and returns immediately with `jobId`
4. Worker consumes queue with fixed concurrency (e.g. 25):
   - fetch HTML with timeout + size cap
   - parse DOM using cheerio
   - extract image/video URLs and normalize to absolute URLs
   - insert into `media_items` table (deduplicated by unique index)
5. Frontend queries `GET /api/media` to browse media with pagination and filters
6. `GET /api/jobs/:id` can be polled to see progress

Why async queue?
- Scraping is slow and unpredictable.
- The API only writes to DB and enqueues jobs.
- This keeps request latency low while workers process scraping in the background.

---

## Data Model (SQL)

scrape_jobs:
- id
- status (queued | processing | done | failed)
- created_at
- total_targets
- done_targets
- failed_targets

scrape_targets:
- id
- job_id
- source_url
- status
- error

media_items:
- id
- job_id
- source_url (page URL)
- media_url (image/video URL)
- type (image | video)
- created_at

Unique index on `(source_url, media_url)` prevents duplicates.

---

## Features

- `POST /api/scrape` returns immediately with `jobId`
- Asynchronous scraping via queue + worker
- HTML-based extraction (no headless browser)
- Results stored in PostgreSQL
- `GET /api/media` supports:
  - pagination (`page`, `limit`)
  - type filter (`type=all|image|video`)
  - text search on URLs
- Simple React UI to submit URLs and browse media
- Docker Compose for one-command startup
- k6 load test for high concurrent request intake

---

## Running with Docker Compose

Prerequisites:
- Docker
- Docker Compose

Start all services:
```bash
docker compose up --build
```

Open in browser:
- Frontend UI: http://localhost:3000
- API health: http://localhost:8080/health
- API docs: http://localhost:8080/docs

Notes:
- Compose uses Bitnami images for all services.
- Postgres and Redis are not exposed on host ports by default.
- Frontend is served by Bitnami NGINX on port 3000.

---

## Local Development (without Docker)

Backend:
```bash
cd backend
npm install
npx prisma generate
npm run dev
```

Run worker in another terminal:
```bash
cd backend
npm run worker
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## API Endpoints

Create scrape job:
```
POST /api/scrape

{
  "urls": ["https://example.com", "https://www.wikipedia.org"]
}
```

Response:
```
{
  "jobId": "uuid",
  "accepted": 2
}
```

Browse media:
```
GET /api/media?page=1&limit=24&type=all&search=example
```

Response:
```
{
  "items": [
    {
      "id": "uuid",
      "type": "image",
      "sourceUrl": "https://example.com",
      "mediaUrl": "https://example.com/logo.png",
      "createdAt": "2026-02-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 24,
  "total": 123,
  "totalPages": 6
}
```

Job status / progress:
```
GET /api/jobs/:id
```

Response:
```
{
  "id": "uuid",
  "status": "processing",
  "totalTargets": 10,
  "doneTargets": 3,
  "failedTargets": 1
}
```

---

## Load Test (k6)

Install k6:
- Follow instructions at https://k6.io/docs/get-started/installation/

Run test:
```bash
k6 run -e API_URL=http://localhost:8080/api/scrape test/k6-scrape.js
```

This simulates high concurrent requests to `POST /api/scrape`. It measures how fast the system accepts and enqueues jobs, not how fast external sites are scraped.

---

## Configuration (Environment Variables)

Backend / Worker:
- `SCRAPE_CONCURRENCY` (default: 25)
- `FETCH_TIMEOUT_MS` (default: 8000)
- `MAX_URLS_PER_REQUEST` (default: 50)

Compose sets defaults in `docker-compose.yml`.

---

## Trade-offs

- No JavaScript rendering (no Puppeteer) so dynamic client-side media may be missed.
- Basic substring search on URLs.
- No per-domain rate limiting.

---

## Possible Improvements

- Headless browser option for JS-heavy sites (behind a feature flag)
- Respect robots.txt and add domain throttling
- Store extra metadata (mime type, size, duration)
- Full-text or trigram index for faster large-scale search
- Job cancel / retry endpoints
- Authentication and per-user quotas

---

## Demo Video

<PASTE_YOUR_LOOM_OR_YOUTUBE_LINK_HERE>

## Repository

<PASTE_YOUR_GITHUB_REPO_LINK_HERE>
