import axios from 'axios';

export type MediaType = 'image' | 'video';
export type MediaItem = {
  id: string;
  type: MediaType;
  sourceUrl: string;
  mediaUrl: string;
  createdAt: string;
};

export type MediaResponse = {
  items: MediaItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Job = {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  createdAt: string;
  totalTargets: number;
  doneTargets: number;
  failedTargets: number;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '', // empty => same origin (/api via proxy or nginx)
  timeout: 10000,
});

export async function postScrape(urls: string[]) {
  const res = await api.post<{ jobId: string; accepted: number }>('/api/scrape', { urls });
  return res.data;
}

export async function getJob(jobId: string) {
  const res = await api.get<Job>(`/api/jobs/${jobId}`);
  return res.data;
}

export async function getMedia(params: {
  page: number;
  limit: number;
  type: 'all' | 'image' | 'video';
  search?: string;
}) {
  const res = await api.get<MediaResponse>('/api/media', { params });
  return res.data;
}

export async function clearMedia() {
  const res = await api.delete<{ ok: boolean }>('/api/media');
  return res.data;
}
