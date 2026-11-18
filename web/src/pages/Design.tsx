import { Bell } from 'lucide-react';
import { Badge, type Tone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CodeBlock } from '@/components/CodeBlock';
import { Input } from '@/components/Input';
import { Tabs } from '@/components/Tabs';
import { useToast } from '@/components/Toast';

const MEANINGS: { tone: Tone; bg: string; name: string; use: string }[] = [
  { tone: 'gold', bg: 'bg-gold', name: 'Gold', use: 'TurboFex itself: the logo, the main button of a screen, the current step, featured things.' },
  { tone: 'ok', bg: 'bg-ok', name: 'Green', use: 'Safe, working, verified, finished: online, linked successfully, verified developer, signed.' },
  { tone: 'info', bg: 'bg-info', name: 'Blue', use: 'Learn and build: links, documentation, developer tools, information notices.' },
  { tone: 'warn', bg: 'bg-warn', name: 'Orange', use: 'Be careful: warnings, paused things, powerful permissions.' },
  { tone: 'bad', bg: 'bg-bad', name: 'Red', use: 'A problem or something that removes: errors, failed attempts, delete buttons.' },
  { tone: 'neutral', bg: 'bg-mute', name: 'Silver', use: 'All text. Bright silver for headings, softer silver for reading, dim silver for small notes.' },
];

export default function Design() {
  const toast = useToast();
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Design kit</h1>
        <p className="mt-2 text-mute">The building blocks used by every new page.</p>
      </div>
      <section aria-labelledby="d-colours" className="space-y-3">
        <h2 id="d-colours" className="text-sm font-medium text-mute">Colour meanings</h2>
        <p className="max-w-2xl text-sm text-mute">Black is the base. Surfaces are lighter graphite so pages have depth. Every colour below means one thing and keeps that meaning on every page.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {MEANINGS.map((m) => (
            <li key={m.name}><Card className="flex gap-3 p-4"><span aria-hidden className={`mt-1 h-4 w-4 shrink-0 rounded-full ${m.bg}`} /><div><p className="flex items-center gap-2 font-medium text-fg">{m.name} <Badge tone={m.tone}>{m.name.toLowerCase()}</Badge></p><p className="mt-1 text-sm text-mute">{m.use}</p></div></Card></li>
          ))}
        </ul>
        <div className="grid grid-cols-3 gap-3 text-center text-xs sm:max-w-md">
          <div className="rounded-lg border border-line bg-bg p-3">base</div>
          <div className="rounded-lg border border-line bg-panel p-3">panel</div>
          <div className="rounded-lg border border-line bg-raise p-3">raised</div>
        </div>
      </section>
      <section aria-labelledby="d-buttons" className="space-y-3">
        <h2 id="d-buttons" className="text-sm font-medium text-mute">Buttons and badges</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Remove</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" onClick={() => toast('This is a notice')}><Bell size={16} /> Show a notice</Button>
        </div>
        <div className="flex flex-wrap gap-2"><Badge>neutral</Badge><Badge tone="gold">gold</Badge><Badge tone="ok">ok</Badge><Badge tone="info">info</Badge><Badge tone="warn">careful</Badge><Badge tone="bad">problem</Badge></div>
      </section>
      <section aria-labelledby="d-forms" className="space-y-3">
        <h2 id="d-forms" className="text-sm font-medium text-mute">Input</h2>
        <Card className="max-w-md"><Input label="Phone number" placeholder="2348012345678" inputMode="numeric" hint="Country code first, no plus sign." /></Card>
      </section>
      <section aria-labelledby="d-tabs" className="space-y-3">
        <h2 id="d-tabs" className="text-sm font-medium text-mute">Tabs and code</h2>
        <Tabs items={[
          { id: 'one', label: 'Install', content: <CodeBlock label="termux" code="npm install" /> },
          { id: 'two', label: 'Verify', content: <CodeBlock label="termux" code="npm run verify" /> },
        ]} />
      </section>
    </main>
  );
}
