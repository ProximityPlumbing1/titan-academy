import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (hasBody ? 'POST' : 'GET'),
      headers: { 'x-titan': '1', ...(hasBody ? { 'content-type': 'application/json' } : {}) },
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, "No signal right now. Nothing's lost: try again when you're back in range.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong. Please try again.');
  return data as T;
}

// Short-lived cache so a screen can fetch everything it needs at once and render settled,
// instead of cards popping in one by one (which makes the page jump).
const prefetched = new Map<string, { data: unknown; at: number }>();
export async function prefetch(paths: Array<string | null>) {
  await Promise.all(paths.filter((p): p is string => !!p).map((p) =>
    api(p).then((data) => prefetched.set(p, { data, at: Date.now() })).catch(() => {})));
}
const fresh = (path: string | null) => {
  const hit = path ? prefetched.get(path) : undefined;
  return hit && Date.now() - hit.at < 10_000 ? hit : undefined;
};

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(() => (fresh(path)?.data as T) ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path && !fresh(path));
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    const hit = fresh(path);
    if (hit) { prefetched.delete(path!); setData(hit.data as T); setLoading(false); return; }
    void load();
  }, [load, path]);
  return { data, error, loading, reload: load, setData };
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return 'Not scheduled';
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
