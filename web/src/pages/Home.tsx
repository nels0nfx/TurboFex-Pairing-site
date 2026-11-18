import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Boxes, Code2, FileImage, FlaskConical, FolderLock, Link2, MessageSquareText, MessagesSquare, ShieldCheck, SlidersHorizontal, Store, Users, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Footer } from '@/components/Footer';
import { HeroChat } from '@/components/HeroChat';
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
const can: [LucideIcon, string, string][] = [
  [MessageSquareText, 'Commands', 'New commands that use your normal prefix, with their own help text.'],
  [Zap, 'Events', 'React to new messages, members joining and members leaving.'],
  [FileImage, 'Pictures and files', 'Send and convert media, within safe size limits.'],
  [Users, 'Group tools', 'Group management, only for plugins you allow and bots that are admins.'],
  [SlidersHorizontal, 'Options', "Owners change a plugin's settings with one command."],
  [FolderLock, 'Private storage', 'Each plugin keeps its own notes, apart from every other plugin.'],
];
const safe = [
  ['Signed store', 'Every published plugin is signed. A bot refuses anything that was changed.'],
  ['Sandboxed code', "Plugins run in a sealed sandbox, away from your bot's files and keys."],
  ['Owner approves powers', 'A plugin cannot use a power its owner did not allow.'],
  ['Reviewed first', 'Nothing reaches the store without checks and a human review.'],
];

const Eyebrow = ({ children }: { children: string }) => <p className="font-mono text-xs uppercase tracking-widest text-mute">{children}</p>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h2>;

function Featured() {
  const { data, isPending, isError } = useStore();
  const all = data && Array.isArray(data.plugins) ? data.plugins : [];
  const list = data && !data.paused ? [...all].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 3) : [];
  const anyFeatured = list.some((p) => p.featured);
  let body;
  if (isPending) body = <div className="grid gap-3 md:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-panel" />)}</div>;
  else if (isError) body = <Card>The plugin list cannot be loaded right now.</Card>;
  else if (data?.paused) body = <Card>The store is paused for a moment. Please check back soon.</Card>;
  else if (!list.length) body = <Card>No plugins are published yet. Approved plugins appear here.</Card>;
  else body = <><div className="grid gap-3 md:grid-cols-3">{list.map((p) => <PluginCard key={p.id} p={p} />)}</div>{!anyFeatured && <p className="mt-3 text-sm text-mute">Showing the latest published plugins.</p>}</>;
  return (
    <section aria-labelledby="featured-h" className="mx-auto mt-24 max-w-6xl px-4">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><Eyebrow>Marketplace</Eyebrow><h2 id="featured-h" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Featured plugins</h2></div>
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
      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-14 pt-14 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal>
            <StatusPill />
            <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">The ultimate <span className="text-gold">WhatsApp bot</span> ecosystem</h1>
            <p className="mt-3 font-mono text-sm text-mute">Connect. Automate. Build. Grow.</p>
            <p className="mt-5 max-w-xl text-lg text-body">Powerful plugins, seamless pairing and a growing developer community, all in one premium platform.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/pair"><Button className="h-11 px-6">Get started <ArrowRight size={16} /></Button></Link>
              <a href={LEGACY.marketplace}><Button variant="outline" className="h-11 px-6">Explore marketplace</Button></a>
            </div>
          </Reveal>
          <HeroChat />
        </section>

        <section className="mx-auto max-w-6xl px-4"><StatsStrip /></section>

        <section aria-label="Where to go" className="mx-auto mt-10 max-w-6xl px-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {quick.map((q) => {
              const body = (
                <Card className="flex h-full flex-col gap-3 p-4 transition hover:border-mute sm:flex-row sm:items-center">
                  <IconTile icon={q.icon} tone={q.tone} />
                  <div><p className="font-medium text-fg">{q.t}</p><p className="mt-0.5 text-sm text-mute">{q.d}</p></div>
                </Card>
              );
              return q.to ? <Link key={q.t} to={q.to} className="block">{body}</Link> : <a key={q.t} href={q.href} className="block">{body}</a>;
            })}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal>
            <Card raised className="grid gap-6 border-gold/30 p-8 shadow-glow md:grid-cols-[1fr_auto] md:items-center">
              <div><Eyebrow>Quick and secure</Eyebrow><H2>Pair your WhatsApp</H2>
                <p className="mt-3 max-w-xl text-body">Use a pairing code or scan a QR code to link your account to your TurboFex bot in seconds. Your account stays yours.</p></div>
              <Link to="/pair"><Button className="h-11 px-6">Start pairing</Button></Link>
            </Card>
          </Reveal>
        </section>

        <Featured />

        <section className="mt-24 border-y border-line bg-panel/50 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <Eyebrow>Developer ecosystem</Eyebrow>
              <H2>Build it once. Reach every group.</H2>
              <p className="mt-3 max-w-2xl text-body">Write a plugin, push a release tag to GitHub and send it for review. When it passes, it is signed and published to the marketplace for bot owners to install.</p>
            </Reveal>
            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([t, d], i) => (
                <li key={t}><Card raised className="h-full p-4"><span className="grid h-7 w-7 place-items-center rounded-md bg-info/12 font-mono text-sm text-info">{i + 1}</span><p className="mt-3 font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Card></li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={LEGACY.developers}><Button>Open Developer Centre</Button></a>
              <a href={LEGACY.guide}><Button variant="outline">Read the guide</Button></a>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal><Eyebrow>Automation</Eyebrow><H2>What a plugin can do</H2>
            <p className="mt-3 max-w-2xl text-body">Plugins add commands and reactions to your bot. Each one only gets the powers its owner approves.</p></Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {can.map(([icon, t, d]) => (
              <Card key={t} className="flex gap-4 p-5"><IconTile icon={icon} tone="info" /><div><p className="font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></div></Card>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal><Eyebrow>Security and reliability</Eyebrow><H2>Safe by design, not by promise</H2></Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {safe.map(([t, d]) => (
              <Card key={t} className="flex gap-4 p-5"><IconTile icon={ShieldCheck} tone="ok" /><div><p className="font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></div></Card>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal><Eyebrow>Community and documentation</Eyebrow><H2>You are not building alone</H2></Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[['WhatsApp Channel', 'News and updates', CHANNEL], ['Telegram group', 'Help from the team and other developers', TELEGRAM], ['Plugin guide', 'Manifest, permissions, events, examples', LEGACY.guide], ['Playground', 'Run plugin code safely in your browser', LEGACY.playground]].map(([t, d, h]) => (
              <a key={t} href={h} {...(h.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="block"><Card className="h-full p-4 transition hover:border-mute"><p className="font-medium text-fg">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Card></a>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Card raised className="border-gold/30 p-8 text-center shadow-glow">
            <IconTile icon={Boxes} tone="gold" className="mx-auto" />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Ready to connect?</h2>
            <p className="mx-auto mt-3 max-w-md text-body">Pair your WhatsApp in a minute, then explore the marketplace.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/pair"><Button className="h-11 px-6">Pair now</Button></Link>
              <a href={LEGACY.marketplace}><Button variant="outline" className="h-11 px-6">Explore marketplace</Button></a>
            </div>
          </Card>
        </section>
      </main>
      <Footer />
    </>
  );
}
