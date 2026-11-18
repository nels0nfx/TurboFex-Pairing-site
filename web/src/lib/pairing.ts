// The pairing flow. It talks to the same backend routes as the current pairing page
// (POST /api/pair, GET /api/job/:id, POST /api/cancel/:id) and follows the same rules.
import { useCallback, useEffect, useRef, useState } from 'react';

export type Method = 'code' | 'qr';
export type JobState = 'starting' | 'code' | 'qr' | 'linking' | 'linked' | 'failed';
export const MAX_SECONDS = 240;          // how long one attempt lives (the server decides; this only draws the bar)
const JOB_KEY = 'tfx-job';               // same key as the current page, so a refresh picks the attempt up
const JOB_ID = /^[\w-]{4,64}$/;

export interface JobInfo {
  state?: JobState; method?: Method; dm?: boolean | null; qr?: string | null; code?: string | null;
  sessionId?: string | null; idSecondsLeft?: number; expired?: boolean; used?: boolean; error?: string; secondsLeft?: number;
}

const NO_NET = 'Could not reach the site. Check your internet connection and try again.';

async function postJson(path: string, body?: unknown): Promise<{ ok: boolean; j: { job?: string; error?: string } }> {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, j };
}
export const startJob = (method: Method, number: string, country: string) => postJson('/api/pair', { method, number, country });
export const cancelJob = (job: string) => { postJson(`/api/cancel/${job}`).catch(() => {}); };
export async function readJob(job: string): Promise<JobInfo> {
  const r = await fetch(`/api/job/${job}`);
  return (await r.json()) as JobInfo;
}

const saveJob = (job: string, method: Method) => { try { sessionStorage.setItem(JOB_KEY, JSON.stringify({ job, method })); } catch { /* fine */ } };
const clearJob = () => { try { sessionStorage.removeItem(JOB_KEY); } catch { /* fine */ } };
function savedJob(): { job: string; method: Method } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(JOB_KEY) || 'null');
    if (s && typeof s.job === 'string' && JOB_ID.test(s.job)) return { job: s.job, method: s.method === 'qr' ? 'qr' : 'code' };
  } catch { /* nothing saved */ }
  return null;
}

export type Phase = 'number' | 'wait' | 'done';
export interface PairState {
  phase: Phase; method: Method; job: string | null; polling: boolean; slow: boolean;
  status: JobState | 'ended' | null; code: string; qr: string | null; secondsLeft: number;
  endedMsg: string | null; canRetry: boolean; retrying: boolean;
  sessionId: string | null; idEndsAt: number; idState: 'live' | 'expired' | 'used'; dm: boolean | null;
  submitting: boolean; error: string; restoring: boolean;
}
const blank = (method: Method): PairState => ({
  phase: 'number', method, job: null, polling: false, slow: false, status: null, code: '', qr: null, secondsLeft: MAX_SECONDS,
  endedMsg: null, canRetry: false, retrying: false, sessionId: null, idEndsAt: 0, idState: 'live', dm: null, submitting: false, error: '', restoring: false,
});

export function usePairing() {
  const [s, setS] = useState<PairState>(() => {
    const saved = savedJob();
    // an unfinished attempt is picked up again after a refresh
    return saved ? { ...blank(saved.method), phase: 'wait', job: saved.job, polling: true, restoring: true } : blank('code');
  });
  const req = useRef(0);            // counts requests, so an old answer never overwrites a newer attempt
  const checking = useRef(false);
  const dmPolls = useRef(0);
  const last = useRef<{ number: string; country: string }>({ number: '', country: '' });
  const jobRef = useRef<string | null>(s.job);
  const now = useRef(s);            // the latest state, readable inside handlers
  const busy = useRef(false);       // set at once, so a second tap in the same moment is ignored
  jobRef.current = s.job;
  now.current = s;

  const reset = useCallback(() => {
    const old = jobRef.current;
    if (old) cancelJob(old);
    clearJob(); req.current++; checking.current = false; dmPolls.current = 0; busy.current = false;
    setS((p) => blank(p.method));
  }, []);

  const setMethod = useCallback((m: Method) => { if (busy.current) return; setS((p) => (p.phase !== 'number' ? p : { ...p, method: m, error: '' })); }, []);

  const ended = (msg: string | null) => (p: PairState): PairState => ({
    ...p, polling: false, status: 'ended', code: '', qr: null, endedMsg: msg || '', canRetry: true, retrying: false, secondsLeft: 0,
  });

  const submit = useCallback(async (number: string, country: string) => {
    if (busy.current) return;                      // a request is already running: ignore repeated taps and Enter
    busy.current = true;
    const method = now.current.method;
    setS((p) => ({ ...p, submitting: true, error: '' }));
    last.current = { number, country };
    const mine = ++req.current;
    try {
      const x = await startJob(method, number, country);
      if (mine !== req.current) return;
      busy.current = false;
      if (!x.ok || !x.j.job) { setS((p) => ({ ...p, submitting: false, error: x.j.error || 'Something went wrong. Please try again.' })); return; }
      dmPolls.current = 0; saveJob(x.j.job, method);
      setS((p) => ({ ...blank(p.method), phase: 'wait', job: x.j.job!, polling: true, status: 'starting' }));
    } catch {
      if (mine === req.current) { busy.current = false; setS((p) => ({ ...p, submitting: false, error: NO_NET })); }
    }
  }, []);

  // "Try again": drop the old attempt and ask for a new code or QR on the same screen
  const retry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const method = now.current.method;
    setS((p) => ({ ...p, retrying: true, polling: false, endedMsg: null, canRetry: false, code: '', qr: null, status: 'starting', secondsLeft: MAX_SECONDS }));
    const old = jobRef.current; if (old) cancelJob(old);
    clearJob(); checking.current = false;
    const mine = ++req.current;
    try {
      const x = await startJob(method, last.current.number, last.current.country);
      if (mine !== req.current) return;
      busy.current = false;
      if (!x.ok || !x.j.job) { setS(ended(x.j.error || 'Something went wrong. Please try again.')); return; }
      dmPolls.current = 0; saveJob(x.j.job, method);
      setS((p) => ({ ...p, job: x.j.job!, polling: true, retrying: false, status: 'starting' }));
    } catch {
      if (mine === req.current) { busy.current = false; setS(ended(NO_NET)); }
    }
  }, []);

  const check = useCallback(async () => {
    const mine = jobRef.current;
    if (!mine || checking.current) return;
    checking.current = true;
    try {
      const j = await readJob(mine);
      checking.current = false;
      if (jobRef.current !== mine) return;
      setS((p) => apply(p, j, dmPolls));
      if (!j.state) clearJob();
      if (j.state === 'failed') clearJob();
      if (j.state === 'linked' && (j.used || j.expired)) clearJob();
    } catch { checking.current = false; /* keep trying */ }
  }, []);

  useEffect(() => {
    if (!s.job || !s.polling) return;
    const t = setInterval(check, s.slow ? 4000 : 2000);
    check();
    return () => clearInterval(t);
  }, [s.job, s.polling, s.slow, check]);

  // the finished session ID counts down here; the server enforces the same limit
  const idEnds = s.idEndsAt;
  const idLive = s.phase === 'done' && s.idState === 'live';
  useEffect(() => {
    if (!idLive || !idEnds) return;
    const t = setInterval(() => {
      if (Date.now() >= idEnds) { clearJob(); setS((p) => ({ ...p, idState: 'expired', sessionId: null })); }
    }, 500);
    return () => clearInterval(t);
  }, [idLive, idEnds]);

  return { state: s, setMethod, submit, retry, reset };
}

// one answer from the server turned into the next page state
function apply(p: PairState, j: JobInfo, dmPolls: { current: number }): PairState {
  if (!j.state) {
    if (p.restoring) return blank(p.method);
    return { ...p, polling: false, status: 'ended', code: '', qr: null, endedMsg: j.error || 'This attempt is no longer available.', canRetry: true, secondsLeft: 0 };
  }
  const n: PairState = { ...p, restoring: false, method: j.method === 'qr' || j.method === 'code' ? j.method : p.method };
  n.canRetry = j.state === 'code' || j.state === 'qr';
  if ((j.state === 'code' || j.state === 'linking') && j.code) n.code = j.code;
  if (j.state === 'qr' && j.qr) n.qr = j.qr;
  if (j.state === 'linking') n.qr = null;
  if (j.state === 'starting' || j.state === 'code' || j.state === 'qr' || j.state === 'linking') {
    n.status = j.state; n.secondsLeft = Math.max(0, j.secondsLeft ?? 0);
    return n;
  }
  if (j.state === 'linked') {
    n.phase = 'done'; n.status = 'linked'; n.canRetry = false;
    if (j.used) return { ...n, polling: false, idState: 'used', sessionId: null, dm: null };
    if (j.expired) return { ...n, polling: false, idState: 'expired', sessionId: null };
    n.sessionId = j.sessionId || p.sessionId;
    if (!p.idEndsAt && (j.idSecondsLeft ?? 0) > 0) n.idEndsAt = Date.now() + (j.idSecondsLeft as number) * 1000;
    n.dm = j.dm ?? null;
    dmPolls.current++;
    // once the copy to WhatsApp is settled, keep watching more slowly for the bot using the ID
    if ((j.dm !== null && j.dm !== undefined) || dmPolls.current > 12) {
      if (j.dm === null || j.dm === undefined) n.dm = false;
      n.slow = true;
    }
    return n;
  }
  // failed
  return { ...n, polling: false, status: 'ended', code: '', qr: null, endedMsg: j.error || '', canRetry: true, secondsLeft: 0 };
}
