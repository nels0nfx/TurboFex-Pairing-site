import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, vi } from 'vitest';
import { Button } from '@/components/Button';
import { Tabs } from '@/components/Tabs';
import { CodeBlock } from '@/components/CodeBlock';
import { Input } from '@/components/Input';
import { StatusPill } from '@/components/StatusPill';
import { cn } from '@/lib/cn';
import { ApiError, getJson } from '@/lib/api';
import App from '@/App';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

const wrap = (ui: React.ReactNode, path = '/') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>,
  );
};
const mockFetch = (impl: () => Promise<Partial<Response>>) => vi.stubGlobal('fetch', vi.fn(impl));

describe('helpers', () => {
  it('cn lets the later Tailwind class win', () => { expect(cn('p-2', 'p-4')).toBe('p-4'); });
  it('getJson returns the data', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    expect(await getJson('/x')).toEqual({ ok: true });
  });
  it('getJson turns a bad status and a dead network into ApiError', async () => {
    mockFetch(async () => ({ ok: false, status: 503 }));
    await expect(getJson('/x')).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(getJson('/x')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('components', () => {
  it('Button fires onClick and respects disabled', async () => {
    const fn = vi.fn();
    const { rerender } = render(<Button onClick={fn}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(fn).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={fn} disabled>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('Input links its label', () => {
    render(<Input label="Phone number" />);
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });
  it('Tabs switch with a click and with the arrow keys', async () => {
    render(<Tabs items={[{ id: 'a', label: 'A', content: <p>first</p> }, { id: 'b', label: 'B', content: <p>second</p> }]} />);
    expect(screen.getByText('first')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.queryByText('first')).toBeNull();
    screen.getByRole('tab', { name: 'B' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
  });
  it('CodeBlock copies the text and says so', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    render(<CodeBlock code="npm install" />);
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(write).toHaveBeenCalledWith('npm install');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
  it('CodeBlock says so when the phone refuses to copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<CodeBlock code="npm install" />);
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText('Could not copy')).toBeInTheDocument();
  });
});

describe('status and pages', () => {
  it('StatusPill shows the real version from /health', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, version: '3.1.0', sessionMinutes: 5 }) }));
    wrap(<StatusPill />);
    expect(await screen.findByText(/online · v3\.1\.0/)).toBeInTheDocument();
  });
  it('StatusPill says so when the server is not reachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    wrap(<StatusPill />);
    // the badge tries once more before giving up, so wait a little longer than usual
    expect(await screen.findByText('server not reachable', {}, { timeout: 5000 })).toBeInTheDocument();
  });
  it('the app shows Home, the design kit, and a calm not-found page', async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, version: '3.1.0', sessionMinutes: 5 }) }));
    const a = wrap(<App />, '/');
    expect(screen.getByRole('heading', { level: 1, name: /complete WhatsApp bot platform/i })).toBeInTheDocument();
    a.unmount();
    const b = wrap(<App />, '/design');
    expect(screen.getByRole('heading', { name: 'Design kit' })).toBeInTheDocument();
    b.unmount();
    wrap(<App />, '/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
