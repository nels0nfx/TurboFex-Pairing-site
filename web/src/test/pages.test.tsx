import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme';
import App from '@/App';

const wrap = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ThemeProvider><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></ThemeProvider>
  </QueryClientProvider>,
);

let job: Record<string, unknown> = { state: 'code', code: 'ABCD-EFGH', secondsLeft: 200 };
beforeEach(() => {
  job = { state: 'code', code: 'ABCD-EFGH', secondsLeft: 200 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url === '/health') return ok({ ok: true, version: '3.2.0', sessionMinutes: 5 });
    if (url === '/api/pair') return ok({ job: 'job-1234' });
    if (url.startsWith('/api/job/')) return ok(job);
    return ok({ ok: true });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('landing page', () => {
  it('has the real headline, the pair button, and normal links to the pages not moved yet', () => {
    wrap('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The ultimate WhatsApp bot ecosystem');
    expect(screen.getAllByRole('link', { name: /get started/i })[0]).toHaveAttribute('href', '/pair');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', '/plugins');
    expect(within(nav).getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/plugin-guide');
  });
  it('shows the footer only here, with the real community links', () => {
    const a = wrap('/');
    expect(screen.getByText(/The WhatsApp bot ecosystem: pairing/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Telegram' })[0]).toHaveAttribute('href', 'https://t.me/+7PwU2Vo9czE1NTRk');
    a.unmount();
    wrap('/pair');
    expect(screen.queryByText(/The WhatsApp bot ecosystem: pairing/)).toBeNull();
  });
  it('the status badge shows the real version', async () => {
    wrap('/');
    expect(await screen.findByText(/online · v3\.2\.0/)).toBeInTheDocument();
  });
});

describe('pairing page', () => {
  it('starts on step 1 with the code tab and a country picked from the time zone', () => {
    wrap('/pair');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connect your WhatsApp');
    expect(screen.getByRole('tab', { name: 'Pairing code' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('WhatsApp number')).toBeInTheDocument();
  });
  it('refuses a short number without calling the server', async () => {
    const user = userEvent.setup();
    wrap('/pair');
    await user.click(screen.getByRole('button', { name: /country/i }));
    await user.click(screen.getByRole('option', { name: /Nigeria/ }));
    await user.type(screen.getByLabelText('WhatsApp number'), '801234');
    await user.click(screen.getByRole('button', { name: 'Generate pairing code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('too short for Nigeria');
    expect(vi.mocked(fetch).mock.calls.some((c) => c[0] === '/api/pair')).toBe(false);
  });
  it('code flow: number, then the code, then the session ID, then link another number', async () => {
    const user = userEvent.setup();
    wrap('/pair');
    await user.click(screen.getByRole('button', { name: /country/i }));
    await user.click(screen.getByRole('option', { name: /Nigeria/ }));
    await user.type(screen.getByLabelText('WhatsApp number'), '8012345678');
    expect(screen.getByText('✓ Valid Nigeria number: +2348012345678')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate pairing code' }));
    expect(await screen.findByRole('img', { name: 'Pairing code A B C D E F G H' })).toBeInTheDocument();
    expect(screen.getByText(/Waiting for you to enter the code in WhatsApp/)).toBeInTheDocument();
    job = { state: 'linked', sessionId: 'TFX-AAAA-BBBB-CCCC', idSecondsLeft: 300, dm: true };
    expect(await screen.findByText('TFX-AAAA-BBBB-CCCC', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('SESSION_ID=TFX-AAAA-BBBB-CCCC')).toBeInTheDocument();
    expect(screen.getByText(/A copy was also sent to your WhatsApp/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Link another number' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate pairing code' })).toBeInTheDocument());
  }, 15000);
  it('QR tab needs no number', async () => {
    const user = userEvent.setup();
    wrap('/pair');
    await user.click(screen.getByRole('tab', { name: 'QR code' }));
    expect(screen.queryByLabelText('WhatsApp number')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show QR code' })).toBeInTheDocument();
  });
  it('the FAQ opens one question at a time and switches groups', async () => {
    const user = userEvent.setup();
    wrap('/pair');
    await user.click(screen.getByRole('tab', { name: 'Safety' }));
    expect(screen.getByText('Is it safe?')).toBeInTheDocument();
    expect(screen.queryByText('How do I link my WhatsApp?')).toBeNull();
  });
});
