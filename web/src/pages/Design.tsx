import { Bell } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CodeBlock } from '@/components/CodeBlock';
import { Input } from '@/components/Input';
import { Tabs } from '@/components/Tabs';
import { useToast } from '@/components/Toast';

export default function Design() {
  const toast = useToast();
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-10 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Design kit</h1>
        <p className="mt-2 text-mute">The building blocks used by every new page.</p>
      </div>
      <section aria-labelledby="d-buttons" className="space-y-3">
        <h2 id="d-buttons" className="text-sm font-medium text-mute">Buttons and badges</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" onClick={() => toast('This is a notice')}><Bell size={16} /> Show a notice</Button>
        </div>
        <div className="flex flex-wrap gap-2"><Badge>neutral</Badge><Badge tone="gold">gold</Badge><Badge tone="ok">ok</Badge><Badge tone="bad">problem</Badge></div>
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
