import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassSummary, LiveInit, LiveMessage, LiveState } from '../../shared/types';
import { api } from './api';

type Role = 'present' | 'follow' | 'tv';
export type Conn = 'connecting' | 'live' | 'polling';

// Live class connection: WebSocket first, polling every 5 s while it reconnects.
export function useLive(code: string | null, role: Role) {
  const [init, setInit] = useState<LiveInit | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [ended, setEnded] = useState<ClassSummary | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let retry = 0;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
    };
    const poll = async () => {
      try {
        const r = await fetch(`/api/live/${code}/state?role=${role}`, { credentials: 'same-origin' });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError({ status: r.status, message: d.error || 'Not available.' });
          return;
        }
        if (d.ended) {
          setEnded(d.summary);
          return;
        }
        setError(null);
        setInit(d.init);
        setState(d.state);
      } catch {
        /* offline: try again on the next tick */
      }
    };
    const startPolling = () => {
      setConn('polling');
      if (!pollTimer) {
        void poll();
        pollTimer = setInterval(poll, 5000);
      }
    };

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws/live?code=${encodeURIComponent(code)}&role=${role}`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as LiveMessage;
        if (m.type === 'init' || m.type === 'state') {
          retry = 0;
          setConn('live');
          setError(null);
          stopPolling();
        }
        if (m.type === 'init') setInit(m);
        else if (m.type === 'state') setState(m);
        else if (m.type === 'ended') setEnded(m.summary);
        else if (m.type === 'error') {
          setNotice(m.message);
          setTimeout(() => setNotice(null), 4000);
        }
      };
      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        if (ev.code === 4401 || ev.code === 4403) {
          setError({ status: ev.code - 4000, message: ev.code === 4401 ? 'Please sign in.' : 'This class is for another group.' });
          return;
        }
        if (ev.code === 4404) setError({ status: 404, message: 'That class is not live yet.' });
        startPolling();
        reconnectTimer = setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      stopped = true;
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [code, role]);

  const send = useCallback(
    async (msg: { type: 'control'; action: string; index?: number; userId?: string } | { type: 'answer'; key: string; choice: number }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return;
      }
      if (!code) return;
      try {
        if (msg.type === 'answer') await api(`/api/live/${code}/answer`, { body: { key: msg.key, choice: msg.choice } });
        else {
          const r = await api<{ summary?: ClassSummary }>(`/api/live/${code}/control`, { body: msg });
          if (r.summary) setEnded(r.summary);
        }
      } catch (e) {
        setNotice((e as Error).message);
        setTimeout(() => setNotice(null), 4000);
      }
    },
    [code],
  );

  return { init, state, ended, error, notice, conn, send };
}
