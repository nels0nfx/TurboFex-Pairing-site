import { useState } from 'react';
import { ArrowRight, Braces, FileCode2, Zap } from 'lucide-react';
import { highlight, type Lang } from '@/lib/highlight';
import { CopyButton } from '@/components/CopyButton';
import { LEGACY } from '@/lib/links';

// These are the real examples from the plugin guide.
const files: { id: string; label: string; lang: Lang; icon: typeof Braces; code: string }[] = [
  { id: 'manifest', label: 'turbofex-plugin.json', lang: 'json', icon: Braces, code: String.raw`{
  "manifestVersion": 1,
  "id": "hello-plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "name": "Hello",
  "description": "Greets you and counts the greetings.",
  "author": { "name": "Your name" },
  "permissions": ["chat.send", "storage"],
  "commands": [
    { "name": "hello", "who": "everyone",
      "description": "Greets you and counts the greetings" }
  ]
}` },
  { id: 'index', label: 'index.js', lang: 'js', icon: FileCode2, code: String.raw`tfx.command('hello', async (c) => {
  const count = Number((await tfx.storage.get('count')) || 0) + 1;
  await tfx.storage.set('count', String(count));
  await c.reply('👋 *Hello ' + (c.sender.name || 'there') + '!*\n▸ *Times used:* ' + count);
});` },
  { id: 'event', label: 'Events', lang: 'js', icon: Zap, code: String.raw`// react when someone joins the group
tfx.on('member.join', async (c) => {
  await c.reply('👋 *Welcome to the group!*');
});` },
];

export function CodePanel() {
  const [id, setId] = useState('index');
  const f = files.find((x) => x.id === id) ?? files[0];
  const lines = highlight(f.code, f.lang);
  return (
    <section className="tf-wrap tf-section" aria-labelledby="code-h">
      <div className="tf-split">
        <div className="tf-stack">
          <p className="tf-eyebrow">Build</p>
          <h2 id="code-h" className="tf-h2 tf-silver">A plugin is two small files</h2>
          <p className="tf-lead">A manifest and one JavaScript file. Your code runs in a sealed sandbox and only gets the powers its owner approves.</p>
        </div>
        <div className="tf-code mt-8 lg:mt-0">
          <div className="tf-tabs" role="tablist" aria-label="Plugin files">
            {files.map((t) => {
              const I = t.icon;
              return <button key={t.id} type="button" role="tab" aria-selected={t.id === id} aria-controls="code-view" className="tf-tab" onClick={() => setId(t.id)}><I size={14} aria-hidden="true" />{t.label}</button>;
            })}
          </div>
          <pre className="tf-pre" id="code-view" role="tabpanel" tabIndex={0} aria-label={`${f.label} example`}>
            <code>
              {lines.map((toks, i) => (
                <span className="tf-line" key={i}>
                  <span className="tf-ln" aria-hidden="true">{i + 1}</span>
                  <span>{toks.map((t, j) => <span key={j} className={`tk-${t.k}`}>{t.v}</span>)}{'\n'}</span>
                </span>
              ))}
            </code>
          </pre>
          <div className="tf-codebar">
            <a href={LEGACY.guide}>Read the plugin guide <ArrowRight size={14} aria-hidden="true" /></a>
            <CopyButton text={f.code} label="Copy code" variant="ghost" className="h-8 px-2 text-xs" />
          </div>
        </div>
      </div>
    </section>
  );
}
