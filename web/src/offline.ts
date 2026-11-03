import { useEffect, useState } from 'react';

// ---- service worker: caches the app and the lessons a tech has opened, so they work with no signal.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Shared office iPads: wipe one person's cached data before the next person signs in.
export async function clearUserCache() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-user-data' });
    if ('caches' in window) await caches.delete('titan-api');
  } catch {
    /* nothing cached */
  }
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// ---- lessons marked done with no signal are queued per user and sent when signal returns.
type Queued = { moduleId: string; index: number };
const key = (userId: string) => `titan:queue:${userId}`;
const read = (userId: string): Queued[] => {
  try { return JSON.parse(localStorage.getItem(key(userId)) ?? '[]'); } catch { return []; }
};
const write = (userId: string, items: Queued[]) => {
  try { if (items.length) localStorage.setItem(key(userId), JSON.stringify(items)); else localStorage.removeItem(key(userId)); } catch { /* storage full or blocked */ }
};

export function queueLessonDone(userId: string, moduleId: string, index: number) {
  const items = read(userId);
  if (!items.some((x) => x.moduleId === moduleId && x.index === index)) write(userId, [...items, { moduleId, index }]);
}

export function queuedLessons(userId: string, moduleId: string): number[] {
  return read(userId).filter((x) => x.moduleId === moduleId).map((x) => x.index);
}

let flushing = false;
export async function flushQueue(userId: string) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let items = read(userId);
    for (const item of [...items]) {
      const res = await fetch(`/api/modules/${item.moduleId}/lessons/${item.index}/done`, {
        method: 'POST', headers: { 'x-titan': '1', 'content-type': 'application/json' }, body: '{}', credentials: 'same-origin',
      }).catch(() => null);
      if (!res) break; // still no signal
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
        items = items.filter((x) => x !== item);
        write(userId, items);
      } else break;
    }
  } finally {
    flushing = false;
  }
}

export const isOffline = (e: unknown) => (e as { status?: number })?.status === 0;
