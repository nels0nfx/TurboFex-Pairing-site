import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { usePairing, type JobInfo } from '@/lib/pairing';

type Reply = { status?: number; body: unknown } | 'network-error';
let calls: { url: string; method: string; body?: string }[] = [];
let jobReplies: JobInfo[] = [];
let pairReplies: Reply[] = [];

beforeEach(() => {
  calls = []; jobReplies = []; pairReplies = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (url === '/api/pair') {
      const r = pairReplies.shift() ?? { body: { job: 'job-1234' } };
      if (r === 'network-error') throw new TypeError('offline');
      const status = r.status ?? 200;
      return { ok: status < 400, status, json: async () => r.body } as Response;
    }
    if (url.startsWith('/api/cancel/')) return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    if (url.startsWith('/api/job/')) {
      const j = jobReplies.length > 1 ? jobReplies.shift()! : jobReplies[0] ?? { state: 'starting', secondsLeft: 240 };
      return { ok: true, status: 200, json: async () => j } as Response;
    }
    throw new Error('unexpected ' + url);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

type Hook = { result: { current: ReturnType<typeof usePairing> } };
const start = async (h: Hook, number = '2348012345678') => {
  await act(async () => { await h.result.current.submit(number, 'NG'); });
};

describe('pairing flow', () => {
  it('sends the number and country, then shows the code the server gives', async () => {
    jobReplies = [{ state: 'code', code: 'ABCD-EFGH', secondsLeft: 200 }];
    const h = renderHook(() => usePairing());
    await start(h);
    expect(JSON.parse(calls[0].body!)).toEqual({ method: 'code', number: '2348012345678', country: 'NG' });
    await waitFor(() => expect(h.result.current.state.code).toBe('ABCD-EFGH'));
    const s = h.result.current.state;
    expect(s.phase).toBe('wait'); expect(s.status).toBe('code'); expect(s.canRetry).toBe(true); expect(s.secondsLeft).toBe(200);
    expect(sessionStorage.getItem('tfx-job')).toContain('job-1234');
  });
  it('QR mode sends no number and shows the picture', async () => {
    jobReplies = [{ state: 'qr', qr: 'data:image/png;base64,AAA', secondsLeft: 100 }];
    const h = renderHook(() => usePairing());
    act(() => h.result.current.setMethod('qr'));
    await start(h, '');
    expect(JSON.parse(calls[0].body!).method).toBe('qr');
    await waitFor(() => expect(h.result.current.state.qr).toBe('data:image/png;base64,AAA'));
  });
  it('a refused start shows the server message and stays on step 1', async () => {
    pairReplies = [{ status: 429, body: { error: 'Too many tries. Please wait a few minutes.' } }];
    const h = renderHook(() => usePairing());
    await start(h);
    expect(h.result.current.state.error).toBe('Too many tries. Please wait a few minutes.');
    expect(h.result.current.state.phase).toBe('number'); expect(h.result.current.state.submitting).toBe(false);
  });
  it('no internet gives the calm message', async () => {
    pairReplies = ['network-error'];
    const h = renderHook(() => usePairing());
    await start(h);
    expect(h.result.current.state.error).toBe('Could not reach the site. Check your internet connection and try again.');
  });
  it('a second tap while the first is running is ignored', async () => {
    const h = renderHook(() => usePairing());
    await act(async () => { await Promise.all([h.result.current.submit('2348012345678', 'NG'), h.result.current.submit('2348012345678', 'NG')]); });
    expect(calls.filter((c) => c.url === '/api/pair')).toHaveLength(1);
  });
  it('linked: shows the session ID, the copy-to-WhatsApp result, and counts down', async () => {
    jobReplies = [{ state: 'linked', sessionId: 'TFX-AAAA-BBBB-CCCC', idSecondsLeft: 300, dm: true }];
    const h = renderHook(() => usePairing());
    await start(h);
    await waitFor(() => expect(h.result.current.state.phase).toBe('done'));
    const s = h.result.current.state;
    expect(s.sessionId).toBe('TFX-AAAA-BBBB-CCCC'); expect(s.idState).toBe('live'); expect(s.dm).toBe(true);
    expect(s.idEndsAt).toBeGreaterThan(Date.now() + 290_000);
    expect(s.slow).toBe(true); // keeps watching, more slowly, for the bot using the ID
  });
  it('linked and already used by the bot, or expired: the ID is never shown', async () => {
    jobReplies = [{ state: 'linked', used: true, sessionId: 'TFX-SHOULD-NOT-SHOW' }];
    const a = renderHook(() => usePairing());
    await start(a);
    await waitFor(() => expect(a.result.current.state.idState).toBe('used'));
    expect(a.result.current.state.sessionId).toBeNull(); expect(a.result.current.state.polling).toBe(false);
    a.unmount();
    jobReplies = [{ state: 'linked', expired: true }];
    const b = renderHook(() => usePairing());
    await start(b);
    await waitFor(() => expect(b.result.current.state.idState).toBe('expired'));
    expect(b.result.current.state.sessionId).toBeNull();
  });
  it('the ID expires by itself when its time runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    jobReplies = [{ state: 'linked', sessionId: 'TFX-AAAA-BBBB-CCCC', idSecondsLeft: 2, dm: true }];
    const h = renderHook(() => usePairing());
    await start(h);
    await waitFor(() => expect(h.result.current.state.idState).toBe('live'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(h.result.current.state.idState).toBe('expired'); expect(h.result.current.state.sessionId).toBeNull();
  });
  it('a failed attempt says so and offers Try again; Try again asks for a new one with the same number', async () => {
    jobReplies = [{ state: 'failed', error: 'WhatsApp refused the request.' }];
    const h = renderHook(() => usePairing());
    await start(h);
    await waitFor(() => expect(h.result.current.state.status).toBe('ended'));
    expect(h.result.current.state.endedMsg).toBe('WhatsApp refused the request.'); expect(h.result.current.state.canRetry).toBe(true);
    pairReplies = [{ body: { job: 'job-9999' } }];
    jobReplies = [{ state: 'code', code: 'WXYZ-1234', secondsLeft: 230 }];
    await act(async () => { await h.result.current.retry(); });
    expect(calls.filter((c) => c.url === '/api/cancel/job-1234')).toHaveLength(1);
    expect(JSON.parse(calls.filter((c) => c.url === '/api/pair')[1].body!).number).toBe('2348012345678');
    await waitFor(() => expect(h.result.current.state.code).toBe('WXYZ-1234'));
    expect(h.result.current.state.job).toBe('job-9999');
  });
  it('an unknown attempt (server restarted) ends calmly', async () => {
    jobReplies = [{ error: 'Not found. Start again.' }];
    const h = renderHook(() => usePairing());
    await start(h);
    await waitFor(() => expect(h.result.current.state.status).toBe('ended'));
    expect(h.result.current.state.endedMsg).toBe('Not found. Start again.');
  });
  it('after a refresh an unfinished attempt is picked up; one the server forgot just starts over', async () => {
    sessionStorage.setItem('tfx-job', JSON.stringify({ job: 'job-5555', method: 'qr' }));
    jobReplies = [{ state: 'qr', qr: 'data:image/png;base64,BBB', secondsLeft: 90 }];
    const h = renderHook(() => usePairing());
    expect(h.result.current.state).toMatchObject({ phase: 'wait', method: 'qr', restoring: true });
    await waitFor(() => expect(h.result.current.state.qr).toBe('data:image/png;base64,BBB'));
    expect(h.result.current.state.restoring).toBe(false);
    h.unmount();
    sessionStorage.setItem('tfx-job', JSON.stringify({ job: 'old-job-1', method: 'code' }));
    jobReplies = [{ error: 'Not found. Start again.' }];
    const g = renderHook(() => usePairing());
    await waitFor(() => expect(g.result.current.state.phase).toBe('number'));
  });
  it('a bad saved value is ignored', () => {
    sessionStorage.setItem('tfx-job', JSON.stringify({ job: '../../etc', method: 'code' }));
    const h = renderHook(() => usePairing());
    expect(h.result.current.state.phase).toBe('number');
  });
  it('Start over cancels the attempt and goes back to step 1', async () => {
    jobReplies = [{ state: 'code', code: 'ABCD-EFGH', secondsLeft: 200 }];
    const h = renderHook(() => usePairing());
    await start(h);
    await waitFor(() => expect(h.result.current.state.code).toBeTruthy());
    act(() => h.result.current.reset());
    expect(h.result.current.state.phase).toBe('number');
    expect(calls.some((c) => c.url === '/api/cancel/job-1234')).toBe(true);
    expect(sessionStorage.getItem('tfx-job')).toBeNull();
  });
});
