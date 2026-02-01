import { useEffect, useMemo, useState } from 'react';
import { clearMedia, getMedia, postScrape } from './api';

const DEFAULT_LIMIT = 24;

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  mediaUrl: string;
  sourceUrl: string;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function App() {
  // Submit scrape
  const [urlsText, setUrlsText] = useState(
    `https://en.wikipedia.org/wiki/Web_scraping\nhttps://www.w3schools.com/html/html5_video.asp\nhttps://developer.mozilla.org/en-US/docs/Web/HTML`
  );
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string>('');
  const [jobStatus, setJobStatus] = useState<string>('');
  const [jobProgress, setJobProgress] = useState<{ done: number; failed: number; total: number } | null>(null);
  const [submitError, setSubmitError] = useState<string>('');

  // Gallery controls
  const [type, setType] = useState<'all' | 'image' | 'video'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(DEFAULT_LIMIT);
  const [sourceTags, setSourceTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [pendingTags, setPendingTags] = useState<string[]>([]);

  // Data
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [clearing, setClearing] = useState(false);

  // Debounce search input -> search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load media
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadingMedia(true);
      setMediaError('');
      try {
        const res = await getMedia({ page, limit, type, search });
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages || 1);
      } catch (e: any) {
        if (cancelled) return;
        setMediaError(e?.message || 'Failed to load media');
      } finally {
        if (!cancelled) setLoadingMedia(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [page, limit, type, search]);

  // Build source URL tags in first-seen order
  useEffect(() => {
    if (!items.length) return;
    setSourceTags((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const it of items) {
        if (it?.sourceUrl && !seen.has(it.sourceUrl)) {
          seen.add(it.sourceUrl);
          next.push(it.sourceUrl);
        }
      }
      return next;
    });
  }, [items]);

  // SSE job progress
  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    const onProgress = (evt: MessageEvent) => {
      const j = JSON.parse(evt.data);
      setJobStatus(j.status);
      setJobProgress({ done: j.doneTargets, failed: j.failedTargets, total: j.totalTargets });
      if (j.status === 'done' && pendingTags.length > 0) {
        const nextTag = pendingTags[0];
        setSelectedTag(nextTag);
        setSearchInput(nextTag);
        setSearch(nextTag);
        setPage(1);
        setPendingTags([]);
      }
    };

    const onError = () => {
      es.close();
    };

    es.addEventListener('progress', onProgress as EventListener);
    es.addEventListener('error', onError as EventListener);

    return () => {
      es.removeEventListener('progress', onProgress as EventListener);
      es.removeEventListener('error', onError as EventListener);
      es.close();
    };
  }, [jobId, pendingTags]);

  // SSE media stream (append new items)
  useEffect(() => {
    if (!jobId) return;
    if (page !== 1) return;

    const params = new URLSearchParams({
      jobId,
      type,
      search
    });

    const es = new EventSource(`/api/media/stream?${params.toString()}`);

    const onMedia = (evt: MessageEvent) => {
      const incoming = JSON.parse(evt.data) as MediaItem[];
      if (!incoming?.length) return;
      let added = 0;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const next = [...prev];
        for (const it of incoming) {
          if (!seen.has(it.id)) {
            next.push(it);
            added += 1;
          }
        }
        return next;
      });
      if (added > 0) {
        setTotal((t) => {
          const nextTotal = t + added;
          setTotalPages(Math.max(1, Math.ceil(nextTotal / limit)));
          return nextTotal;
        });
      }
    };

    const onError = () => {
      es.close();
    };

    es.addEventListener('media', onMedia as EventListener);
    es.addEventListener('error', onError as EventListener);

    return () => {
      es.removeEventListener('media', onMedia as EventListener);
      es.removeEventListener('error', onError as EventListener);
      es.close();
    };
  }, [jobId, page, type, search, limit]);

  const parsedUrls = useMemo(() => {
    return urlsText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  }, [urlsText]);

  async function onSubmit() {
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await postScrape(parsedUrls);
      setJobId(res.jobId);
      setJobStatus('queued');
      setSelectedTag('all');
      setSearchInput('');
      setSearch('');
      if (parsedUrls.length > 0) {
        setSourceTags((prev) => {
          const seen = new Set(prev);
          const next = [...prev];
          for (const u of parsedUrls) {
            if (!seen.has(u)) {
              seen.add(u);
              next.push(u);
            }
          }
          return next;
        });
        setPendingTags(parsedUrls);
      }
      // refresh media list soon
      setTimeout(() => {
        setPage(1);
      }, 300);
    } catch (e: any) {
      setSubmitError(e?.response?.data?.error || e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const canPrev = page > 1;
  const canNext = page < totalPages;

  async function onClearAll() {
    if (!confirm('Clear all crawled data? This cannot be undone.')) return;
    setClearing(true);
    try {
      await clearMedia();
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setSourceTags([]);
      setSelectedTag('all');
      setSearchInput('');
      setSearch('');
      setPage(1);
      setJobId('');
      setJobStatus('');
      setJobProgress(null);
    } catch (e: any) {
      setMediaError(e?.response?.data?.error || e?.message || 'Failed to clear data');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="app">
      <h1 className="app-title">Media Scraper</h1>
      <p className="app-subtitle">
        Submit URLs to scrape images/videos → view results with pagination, filter, and search.
      </p>

      {/* Submit Section */}
      <div className="panel">
        <h2 className="panel-title">1) Submit scrape request</h2>
        <div className="panel-grid">
          <textarea
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            rows={6}
            placeholder="One URL per line..."
            className="url-textarea"
          />
          <div className="row">
            <button
              onClick={onSubmit}
              disabled={submitting || parsedUrls.length === 0}
              className="primary-btn"
            >
              {submitting ? 'Submitting…' : `Scrape (${parsedUrls.length} URL${parsedUrls.length > 1 ? 's' : ''})`}
            </button>

            {jobId && (
              <div className="job-meta">
                <div><b>Job:</b> {jobId}</div>
                <div>
                  <b>Status:</b> {jobStatus || '—'}{' '}
                  {jobProgress && (
                    <span className="muted">
                      ({Math.round(((jobProgress.done + jobProgress.failed) / Math.max(jobProgress.total, 1)) * 100)}% • {jobProgress.done + jobProgress.failed}/{jobProgress.total})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {submitError && <div className="error-text">{submitError}</div>}

          <div className="note-text">
            Notes: Scraping runs async (queue). UI will show items as they’re inserted.
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      <div className="panel">
        <h2 className="panel-title">2) Media gallery</h2>

        <div className="row">
          <label className="row">
            <span className="label">Type</span>
            <select
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value as 'all' | 'image' | 'video');
              }}
              className="select"
            >
              <option value="all">All</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          </label>

          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by source URL or media URL..."
            className="search-input"
          />

          <button className="ghost-btn" onClick={onClearAll} disabled={clearing}>
            {clearing ? 'Clearing…' : 'Clear all'}
          </button>

          <div className="muted">
            Total: <b className="strong">{total}</b>
          </div>
        </div>

        <div className="pager">
          <button
            disabled={!canPrev}
            onClick={() => setPage((p) => clamp(p - 1, 1, totalPages))}
            className="ghost-btn"
          >
            Prev
          </button>
          <div className="muted">
            Page <b className="strong">{page}</b> / {totalPages}
          </div>
          <button
            disabled={!canNext}
            onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))}
            className="ghost-btn"
          >
            Next
          </button>
        </div>

        <div className="tag-row">
          <button
            className={`tag ${selectedTag === 'all' ? 'tag-active' : ''}`}
            onClick={() => {
              setSelectedTag('all');
              setSearchInput('');
              setSearch('');
              setPage(1);
            }}
          >
            All sources
          </button>
          {sourceTags.map((src) => (
            <button
              key={src}
              className={`tag ${selectedTag === src ? 'tag-active' : ''}`}
              onClick={() => {
                setSelectedTag(src);
                setSearchInput(src);
                setSearch(src);
                setPage(1);
              }}
              title={src}
            >
              {src}
            </button>
          ))}
        </div>

        {loadingMedia && <div className="status-text">Loading…</div>}
        {mediaError && <div className="error-text">{mediaError}</div>}

        <div className="gallery-grid">
          {items.map((it) => (
            <div key={it.id} className="media-card">
              <div className="media-meta">
                <span className="type-pill">{it.type}</span>
                <div title={it.sourceUrl} className="source-line">
                  {it.sourceUrl}
                </div>
              </div>

              {it.type === 'image' ? (
                <a href={it.mediaUrl} target="_blank" rel="noreferrer" title={it.mediaUrl}>
                  <img
                    src={it.mediaUrl}
                    alt="media"
                    loading="lazy"
                    className="media-thumb"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </a>
              ) : (
                <div className="video-wrap">
                  <video
                    src={it.mediaUrl}
                    controls
                    preload="none"
                    className="media-thumb"
                    onError={(e) => {
                      (e.currentTarget as HTMLVideoElement).style.display = 'none';
                    }}
                  />
                  <a href={it.mediaUrl} target="_blank" rel="noreferrer" className="media-link">
                    Open video link
                  </a>
                </div>
              )}

              <div className="media-url" title={it.mediaUrl}>
                {it.mediaUrl.length > 48 ? it.mediaUrl.slice(0, 48) + '…' : it.mediaUrl}
              </div>
            </div>
          ))}
        </div>

        {!loadingMedia && items.length === 0 && (
          <div className="status-text">
            No results. Try submit URLs above or adjust filters.
          </div>
        )}
      </div>
    </div>
  );
}
