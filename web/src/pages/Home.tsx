import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Boxes, Code2, FlaskConical, Link2, MessagesSquare, ShieldCheck, Store, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/Button';
import { Backdrop } from '@/components/fx/Backdrop';
import { Bento } from '@/components/fx/Bento';
import { Glass } from '@/components/fx/Glass';
import { HeroScene } from '@/components/fx/HeroScene';
import { Marquee } from '@/components/fx/Marquee';
import { Footer } from '@/components/Footer';
import { IconTile } from '@/components/IconTile';
import { PluginCard } from '@/components/PluginCard';
import { Reveal } from '@/components/Reveal';
import { StatsStrip } from '@/components/StatsStrip';
import { StatusPill } from '@/components/StatusPill';
import type { Tone } from '@/components/Badge';
import { useStore } from '@/lib/queries';
import { CHANNEL, LEGACY, TELEGRAM } from '@/lib/links';

// gold = the TurboFex product, blue = learn and build, silver = community
const quick: { t: string; d: string; icon: LucideIcon; tone: Tone; to?: string; href?: string }[] = [
  { t: 'Pair your WhatsApp', d: 'Pairing code or QR code', icon: Link2, tone: 'gold', to: '/pair' },
  { t: 'Plugin marketplace', d: 'Install signed, reviewed plugins', icon: Store, tone: 'gold', href: LEGACY.marketplace },
  { t: 'Developer Centre', d: 'Send and manage your plugins', icon: Code2, tone: 'info', href: LEGACY.developers },
  { t: 'Documentation', d: 'The plugin guide', icon: BookOpen, tone: 'info', href: LEGACY.guide },
  { t: 'Playground', d: 'Try plugin code in your browser', icon: FlaskConical, tone: 'info', href: LEGACY.playground },
  { t: 'Community', d: 'WhatsApp channel and Telegram', icon: MessagesSquare, tone: 'neutral', href: LEGACY.community },
];
const steps = [
  ['Sign in with GitHub', 'No new password. Your repository stays yours.'],
  ['Send a release tag', 'Or let a GitHub webhook send each new release for you.'],
  ['Automatic checks, then review', 'The manifest, permissions and code are checked before a person looks.'],
  ['Signed and published', 'Approved releases are signed with the TurboFex key and appear in the store.'],
];
const safe = [
  ['Signed store', 'Every published plugin is signed. A bot refuses anything that was changed.'],
  ['Sandboxed code', "Plugins run in a sealed sandbox, away from your bot's files and keys."],
  ['Owner approves powers', 'A plugin cannot use a power its owner did not allow.'],
  ['Reviewed first', 'Nothing reaches the store without checks and a human review.'],
];

const Eyebrow = ({ children }: { children: string }) => <p className="glass inline-block rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-mute">{children}</p>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{children}</h2>;

function Featured() {
  const { data, isPending, isError } = useStore();
  const all = data && Array.isArray(data.plugins) ? data.plugins : [];
  const list = data && !data.paused ? [...all].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 3) : [];
  const anyFeatured = list.some((p) => p.featured);
  let body;
  if (isPending) body = <div className="grid gap-3 md:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="glass h-44 animate-pulse rounded-2xl" />)}</div>;
  else if (isError) body = <Glass className="p-5">The plugin list cannot be loaded right now.</Glass>;
  else if (data?.paused) body = <Glass className="p-5">The store is paused for a moment. Please check back soon.</Glass>;
  else if (!list.length) body = <Glass className="p-5">No plugins are published yet. Approved plugins appear here.</Glass>;
  else body = <><div className="grid gap-3 md:grid-cols-3">{list.map((p) => <PluginCard key={p.id} p={p} />)}</div>{!anyFeatured && <p className="mt-3 text-sm text-mute">Showing the latest published plugins.</p>}</>;
  return (
    <section aria-labelledby="featured-h" className="mx-auto mt-28 max-w-6xl px-4">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><Eyebrow>Marketplace</Eyebrow><h2 id="featured-h" className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Featured plugins</h2></div>
        <a href={LEGACY.marketplace} className="shrink-0 text-sm text-info hover:underline">View all</a>
      </div>
      {body}
    </section>
  );
}

export default function Home() {
  useEffect(() => { document.title = 'TurboFex — The WhatsApp Bot Ecosystem'; }, []);
  return (
    <>
      <main id="main" className="relative">
        <Backdrop />
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-12 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <StatusPill />
            <h1 className="mt-6 text-5xl font-semibold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">The ultimate <span className="shimmer">WhatsApp bot</span> ecosystem</h1>
            <p className="mt-4 font-mono text-sm text-mute">Connect. Automate. Build. Grow.</p>
            <p className="mt-5 max-w-xl text-lg text-body">Powerful plugins, seamless pairing and a growing developer community, all in one premium platform.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/pair"><Button className="h-12 px-7">Get started <ArrowRight size={16} /></Button></Link>
              <a href={LEGACY.marketplace}><Button variant="outline" className="glass h-12 px-7">Explore marketplace</Button></a>
            </div>
          </Reveal>
          <HeroScene />
        </section>

        <section className="mx-auto max-w-6xl px-4"><StatsStrip /></section>
        <div className="mt-8"><Marquee /></div>

        <section aria-label="Where to go" className="mx-auto mt-12 max-w-6xl px-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {quick.map((q) => {
              const body = (
                <Glass className="flex h-full flex-col gap-3 p-4 transition duration-300 hover:-translate-y-1 sm:flex-row sm:items-center">
                  <IconTile icon={q.icon} tone={q.tone} />
                  <div><p className="font-medium text-fg">{q.t}</p><p className="mt-0.5 text-sm text-mute">{q.d}</p></div>
                </Glass>
              );
              return q.to ? <Link key={q.t} to={q.to} className="block">{body}</Link> : <a key={q.t} href={q.href} className="block">{body}</a>;
            })}
          </div>
        </section>

        <section className="mx-auto mt-28 max-w-6xl px-4">
          <Reveal>
            <Glass className="relative overflow-hidden border-gold/30 p-8 shadow-glow sm:p-12">
              <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/20 blur-[90px]" />
              <div className="relative grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
                <div><Eyebrow>Quick and secure</Eyebrow><H2>Pair your WhatsApp</H2>
                  <p className="mt-3 max-w-xl text-body">Use a pairing code or scan a QR code to link your account to your TurboFex bot in seconds. Your account stays yours.</p>
                  <Link to="/pair" className="mt-6 inline-block"><Button className="h-12 px-7">Start pairing</Button></Link></div>
                <ol className="space-y-2.5">
                  {['Enter your number', 'Link it in WhatsApp', 'Get your session ID'].map((t, i) => (
                    <li key={t} className="glass flex items-center gap-3 rounded-xl px-4 py-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-gold/15 font-mono text-sm text-gold">{i + 1}</span><span className="text-fg">{t}</span></li>
                  ))}
                </ol>
              </div>
            </Glass>
          </Reveal>
        </section>

        <Featured />

        <section className="relative mx-auto mt-28 max-w-6xl px-4">
          <Reveal>
            <Eyebrow>Developer ecosystem</Eyebrow>
            <H2>Build it once. Reach every group.</H2>
            <p className="mt-3 max-w-2xl text-body">Write a plugin, push a release tag to GitHub and send it for review. When it passes, it is signed and published to the marketplace for bot owners to install.</p>
          </Reveal>
          <div className="relative mt-10">
            <div aria-hidden className="absolute left-0 right-0 top-[22px] hidden h-px bg-gradient-to-r from-transparent via-info/50 to-transparent lg:block" />
            <ol className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([t, d], i) => (
                <li key={t}><Glass className="h-full p-5 transition duration-300 hover:-translate-y-1"><span className="relative grid h-11 w-11 place-items-center rounded-full border border-info/40 bg-info/10 font-mono text-info"><span aria-hidden className="ring absolute inset-0 rounded-full border border-info/50" style={{ animationDelay: `${i * 0.5}s` }} />{i + 1}</span><p className="mt-4 font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Glass></li>
              ))}
            </ol>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={LEGACY.developers}><Button className="h-11 px-6">Open Developer Centre</Button></a>
            <a href={LEGACY.guide}><Button variant="outline" className="glass h-11 px-6">Read the guide</Button></a>
          </div>
        </section>

        <section className="mx-auto mt-28 max-w-6xl px-4">
          <Reveal><Eyebrow>Automation</Eyebrow><H2>What a plugin can do</H2>
            <p className="mt-3 max-w-2xl text-body">Plugins add commands and reactions to your bot. Each one only gets the powers its owner approves.</p></Reveal>
          <div className="mt-8"><Bento /></div>
        </section>

        <section className="mx-auto mt-28 max-w-6xl px-4">
          <Reveal><Eyebrow>Security and reliability</Eyebrow><H2>Safe by design, not by promise</H2></Reveal>
          <div className="mt-8 grid items-center gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div aria-hidden className="relative mx-auto grid h-56 w-56 place-items-center">
              {[0, 1, 2].map((i) => <span key={i} className="ring absolute h-40 w-40 rounded-full border border-ok/40" style={{ animationDelay: `${i * 0.8}s` }} />)}
              <span className="glass relative grid h-28 w-28 place-items-center rounded-3xl border-ok/30 text-ok shadow-[0_0_60px_-10px_rgb(var(--ok)/0.5)]"><ShieldCheck size={48} /></span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {safe.map(([t, d]) => (
                <Glass key={t} className="p-5 transition duration-300 hover:-translate-y-1 hover:border-ok/40"><IconTile icon={ShieldCheck} tone="ok" /><p className="mt-3 font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Glass>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-28 max-w-6xl px-4">
          <Reveal><Eyebrow>Community and documentation</Eyebrow><H2>You are not building alone</H2></Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[['WhatsApp Channel', 'News and updates', CHANNEL], ['Telegram group', 'Help from the team and other developers', TELEGRAM], ['Plugin guide', 'Manifest, permissions, events, examples', LEGACY.guide], ['Playground', 'Run plugin code safely in your browser', LEGACY.playground]].map(([t, d, h]) => (
              <a key={t} href={h} {...(h.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="block"><Glass className="h-full p-4 transition duration-300 hover:-translate-y-1"><p className="font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Glass></a>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-28 max-w-6xl px-4">
          <Glass className="relative overflow-hidden border-gold/30 p-10 text-center shadow-glow sm:p-16">
            <div aria-hidden className="bg-grid absolute inset-0 opacity-60" />
            <div aria-hidden className="absolute left-1/2 top-0 h-56 w-[28rem] -translate-x-1/2 rounded-full bg-gold/25 blur-[100px]" />
            <div className="relative">
              <IconTile icon={Boxes} tone="gold" className="mx-auto" />
              <h2 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Ready to connect?</h2>
              <p className="mx-auto mt-3 max-w-md text-body">Pair your WhatsApp in a minute, then explore the marketplace.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link to="/pair"><Button className="h-12 px-7">Pair now</Button></Link>
                <a href={LEGACY.marketplace}><Button variant="outline" className="glass h-12 px-7">Explore marketplace</Button></a>
              </div>
            </div>
          </Glass>
        </section>
      </main>
      <Footer />
    </>
  );
}
