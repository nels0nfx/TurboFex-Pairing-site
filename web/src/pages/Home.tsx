import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, FileImage, FolderLock, MessageSquareText, ShieldCheck, SlidersHorizontal, Users, Zap } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Footer } from '@/components/Footer';
import { Reveal } from '@/components/Reveal';
import { StatusPill } from '@/components/StatusPill';
import { CHANNEL, LEGACY, TELEGRAM } from '@/lib/links';

const quick = [
  { t: 'Pair your WhatsApp', d: 'Pairing code or QR code', to: '/pair' },
  { t: 'Plugin marketplace', d: 'Install signed, reviewed plugins', href: LEGACY.marketplace },
  { t: 'Developer Centre', d: 'Send and manage your plugins', href: LEGACY.developers },
  { t: 'Documentation', d: 'The plugin guide', href: LEGACY.guide },
  { t: 'Playground', d: 'Try plugin code in your browser', href: LEGACY.playground },
  { t: 'Community', d: 'WhatsApp channel and Telegram', href: LEGACY.community },
];
const steps = [
  ['Sign in with GitHub', 'No new password. Your repository stays yours.'],
  ['Send a release tag', 'Or let a GitHub webhook send each new release for you.'],
  ['Automatic checks, then review', 'The manifest, permissions and code are checked before a person looks.'],
  ['Signed and published', 'Approved releases are signed with the TurboFex key and appear in the store.'],
];
const can = [
  [MessageSquareText, 'Commands', 'New commands that use your normal prefix, with their own help text.'],
  [Zap, 'Events', 'React to new messages, members joining and members leaving.'],
  [FileImage, 'Pictures and files', 'Send and convert media, within safe size limits.'],
  [Users, 'Group tools', 'Group management, only for plugins you allow and bots that are admins.'],
  [SlidersHorizontal, 'Options', "Owners change a plugin's settings with one command."],
  [FolderLock, 'Private storage', 'Each plugin keeps its own notes, apart from every other plugin.'],
] as const;
const safe = [
  ['Signed store', 'Every published plugin is signed. A bot refuses anything that was changed.'],
  ['Sandboxed code', "Plugins run in a sealed sandbox, away from your bot's files and keys."],
  ['Owner approves powers', 'A plugin cannot use a power its owner did not allow.'],
  ['Reviewed first', 'Nothing reaches the store without checks and a human review.'],
];

const Eyebrow = ({ children }: { children: string }) => <p className="font-mono text-xs uppercase tracking-widest text-gold">{children}</p>;
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h2>;

export default function Home() {
  useEffect(() => { document.title = 'TurboFex — The WhatsApp Bot Ecosystem'; }, []);
  return (
    <>
      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <Reveal>
            <StatusPill />
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">The ultimate <span className="text-gold">WhatsApp bot</span> ecosystem</h1>
            <p className="mt-3 font-mono text-sm text-mute">Connect. Automate. Build. Grow.</p>
            <p className="mt-5 max-w-xl text-lg text-mute">Powerful plugins, seamless pairing and a growing developer community, all in one premium platform.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/pair"><Button className="h-11 px-6">Get started <ArrowRight size={16} /></Button></Link>
              <a href={LEGACY.marketplace}><Button variant="outline" className="h-11 px-6">Explore marketplace</Button></a>
            </div>
          </Reveal>
        </section>

        <section aria-label="Where to go" className="mx-auto max-w-6xl px-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quick.map((q) => {
              const body = <Card className="h-full p-4 transition hover:border-gold/50"><p className="font-medium">{q.t}</p><p className="mt-1 text-sm text-mute">{q.d}</p></Card>;
              return q.to ? <Link key={q.t} to={q.to}>{body}</Link> : <a key={q.t} href={q.href}>{body}</a>;
            })}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal>
            <Card className="grid gap-6 p-8 shadow-glow md:grid-cols-[1fr_auto] md:items-center">
              <div><Eyebrow>Quick & secure</Eyebrow><H2>Pair your WhatsApp</H2>
                <p className="mt-3 max-w-xl text-mute">Use a pairing code or scan a QR code to link your account to your TurboFex bot in seconds. Your account stays yours.</p></div>
              <Link to="/pair"><Button className="h-11 px-6">Start pairing</Button></Link>
            </Card>
          </Reveal>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal>
            <Eyebrow>Developer ecosystem</Eyebrow>
            <H2>Build it once. Reach every group.</H2>
            <p className="mt-3 max-w-2xl text-mute">Write a plugin, push a release tag to GitHub and send it for review. When it passes, it is signed and published to the marketplace for bot owners to install.</p>
          </Reveal>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([t, d], i) => (
              <li key={t}><Card className="h-full p-4"><span className="font-mono text-sm text-gold">{i + 1}</span><p className="mt-2 font-medium">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Card></li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={LEGACY.developers}><Button>Open Developer Centre</Button></a>
            <a href={LEGACY.guide}><Button variant="outline">Read the guide</Button></a>
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal><Eyebrow>Automation</Eyebrow><H2>What a plugin can do</H2>
            <p className="mt-3 max-w-2xl text-mute">Plugins add commands and reactions to your bot. Each one only gets the powers its owner approves.</p></Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {can.map(([Icon, t, d]) => (
              <Card key={t} className="p-5"><Icon size={18} className="text-gold" /><p className="mt-3 font-medium">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Card>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal><Eyebrow>Security and reliability</Eyebrow><H2>Safe by design, not by promise</H2></Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {safe.map(([t, d]) => (
              <Card key={t} className="flex gap-3 p-5"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-gold" /><div><p className="font-medium">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></div></Card>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Reveal><Eyebrow>Community and documentation</Eyebrow><H2>You are not building alone</H2></Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['WhatsApp Channel', 'News and updates', CHANNEL], ['Telegram group', 'Help from the team and other developers', TELEGRAM], ['Plugin guide', 'Manifest, permissions, events, examples', LEGACY.guide], ['Playground', 'Run plugin code safely in your browser', LEGACY.playground]].map(([t, d, h]) => (
              <a key={t} href={h} {...(h.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><Card className="h-full p-4 transition hover:border-gold/50"><p className="font-medium">{t}</p><p className="mt-1 text-sm text-mute">{d}</p></Card></a>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-24 max-w-6xl px-4">
          <Card className="p-8 text-center shadow-glow">
            <Boxes size={22} className="mx-auto text-gold" />
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Ready to connect?</h2>
            <p className="mx-auto mt-3 max-w-md text-mute">Pair your WhatsApp in a minute, then explore the marketplace.</p>
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
