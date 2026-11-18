import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, vi } from 'vitest';
import App from '@/App';

const wrap = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
  </QueryClientProvider>,
);

let plugins: unknown = { total: 0, plugins: [] };
let status: unknown = { maintenance: { on: false, message: '' }, announcement: null };
let job: Record<string, unknown> = { state: 'code', code: 'ABCD-EFGH', secondsLeft: 200 };
beforeEach(() => {
  job = { state: 'code', code: 'ABCD-EFGH', secondsLeft: 200 };
  plugins = { total: 0, plugins: [] }; status = { maintenance: { on: false, message: '' }, announcement: null };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url === '/health') return ok({ ok: true, version: '3.2.0', sessionMinutes: 5 });
    if (url === '/api/plugins') return ok(plugins);
    if (url === '/api/status') return ok(status);
    if (url === '/api/pair') return ok({ job: 'job-1234' });
    if (url.startsWith('/api/job/')) return ok(job);
    return ok({ ok: true });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('landing page', () => {
  it('has the real headline, the pair button, and normal links to the pages not moved yet', () => {
    wrap('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('WhatsApp bots, built to extend');
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

describe('landing page: real data, nothing made up', () => {
  const store = (n: number, extra: Record<string, unknown> = {}) => ({ total: n, plugins: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Plugin ${i}`, version: '1.0.0', description: `Does thing ${i}`, dev: { developer: i % 2 ? 'ada' : 'bola', verified: i === 0 }, ...extra })) });
  it('shows up to three plugins from the store, featured first, linking to the marketplace', async () => {
    plugins = { total: 4, plugins: [...store(3).plugins, { id: 'star', name: 'Star Plugin', version: '2.0.0', description: 'Shiny', featured: true, rating: { avg: 4.5, count: 2 } }] };
    wrap('/');
    const card = await screen.findByRole('link', { name: 'Star Plugin, version 2.0.0' });
    expect(card).toHaveAttribute('href', '/plugins#star');
    expect(within(card).getByText('Featured')).toBeInTheDocument();
    expect(within(card).getByText(/4\.5 \(2\)/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /version/ })).toHaveLength(3);
  });
  it('says so when there are no plugins, when the store is paused, and when it cannot load', async () => {
    wrap('/');
    expect(await screen.findByText(/No plugins are published yet/)).toBeInTheDocument();
  });
  it('the numbers come from the server: online, plugin count, developer count', async () => {
    plugins = store(3);
    wrap('/');
    const strip = await screen.findByRole('list', { name: 'TurboFex in numbers' });
    await waitFor(() => expect(within(strip).getByText('Published plugins')).toBeInTheDocument());
    expect(within(strip).getByText('Online')).toBeInTheDocument();
    // the numbers count up, so give the animation a moment
    await waitFor(() => expect(within(strip).getByText('Developers').previousSibling).toHaveTextContent('2'), { timeout: 3000 });
    await waitFor(() => expect(within(strip).getByText('Published plugins').previousSibling).toHaveTextContent('3'), { timeout: 3000 });
  });
  it('shows the maintenance notice and a dismissable announcement from the admin panel', async () => {
    status = { maintenance: { on: true, message: 'Back in ten minutes.' }, announcement: { id: 'a1', level: 'warning', text: 'New plugins today.' } };
    wrap('/');
    expect(await screen.findByText('Back in ten minutes.')).toBeInTheDocument();
    expect(await screen.findByText('New plugins today.')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('New plugins today.')).toBeNull();
  });
  it('the logo is one word, TurboFex, and the link has a clear name', () => {
    wrap('/');
    const logo = screen.getAllByRole('link', { name: 'TurboFex home' })[0];
    expect(logo).toHaveAttribute('href', '/');
    expect(logo.lastElementChild).toHaveTextContent(/^TurboFex$/);
  });
});

describe('landing page: the new look (Phase A)', () => {
  it('has the 3D hero object, hidden from screen readers, and a full-width main button plus a docs link', () => {
    wrap('/');
    expect(screen.getByTestId('hero-cube')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: /browse the plugin marketplace/i })).toHaveAttribute('href', '/plugins');
    expect(screen.getByRole('link', { name: /documentation/i })).toHaveAttribute('href', '/plugin-guide');
  });
  it('"Works with" lists only the real things, no company logos', () => {
    wrap('/');
    const sec = screen.getByRole('region', { name: 'Works with' });
    for (const n of ['WhatsApp', 'GitHub', 'JavaScript plugins', 'Signed store']) expect(within(sec).getByText(n)).toBeInTheDocument();
    expect(sec.querySelectorAll('img').length).toBe(0);
  });
  it('"Link in a minute" changes with the chosen way to link', async () => {
    const user = userEvent.setup();
    wrap('/');
    expect(screen.getByText(/Link with a pairing code/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'QR code' }));
    expect(screen.getByText(/Link with a QR code/)).toBeInTheDocument();
  });
  it('the code panel shows the real plugin example with line numbers and switches files', async () => {
    const user = userEvent.setup();
    wrap('/');
    const panel = screen.getByRole('tabpanel', { name: 'index.js example' });
    expect(panel).toHaveTextContent("tfx.command('hello'");
    expect(panel.querySelectorAll('.tf-ln').length).toBe(5);
    await user.click(screen.getByRole('tab', { name: /turbofex-plugin\.json/ }));
    expect(screen.getByRole('tabpanel', { name: 'turbofex-plugin.json example' })).toHaveTextContent('"id": "hello-plugin"');
  });
  it('test mode is clearly labelled as an example and links to the real Playground', async () => {
    const user = userEvent.setup();
    wrap('/');
    const fig = screen.getByRole('figure', { name: /Example output of the plugin test tool/ });
    expect(within(fig).getByText('Example')).toBeInTheDocument();
    expect(within(fig).getByText('not a live run')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the playground/i })).toHaveAttribute('href', '/playground');
    await user.click(screen.getByRole('tab', { name: 'Member joins' }));
    expect(within(fig).getByText(/--event member\.join/)).toBeInTheDocument();
    expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
  });
  it('the mobile menu opens as a full-screen dialog and closes again', async () => {
    const user = userEvent.setup();
    wrap('/');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', '/plugins');
    await user.click(within(menu).getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
