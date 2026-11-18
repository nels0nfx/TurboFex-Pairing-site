import { useState, type CSSProperties } from 'react';
import { ArrowRight, FlaskConical, MessageSquare, ShieldCheck, UserPlus, Zap, type LucideIcon } from 'lucide-react';
import { LEGACY } from '@/lib/links';

// Everything here is an EXAMPLE of what the test tool prints. It is not a live run, and the page says so.
const runs: { id: string; label: string; icon: LucideIcon; cmd: string; out: string[] }[] = [
  { id: 'command', label: 'Command', icon: MessageSquare, cmd: 'node tools/plugin-test.js my-plugin --command "hello Sam"', out: ['loaded hello-plugin 1.0.0', 'command hello  (who: everyone)', 'reply  👋 Hello Sam!', 'reply  ▸ Times used: 1'] },
  { id: 'message', label: 'Message', icon: Zap, cmd: 'node tools/plugin-test.js my-plugin --event message --text "hi"', out: ['loaded hello-plugin 1.0.0', 'event message  text: "hi"', 'no handler replied'] },
  { id: 'join', label: 'Member joins', icon: UserPlus, cmd: 'node tools/plugin-test.js my-plugin --event member.join', out: ['loaded hello-plugin 1.0.0', 'event member.join', 'reply  👋 Welcome to the group!'] },
];

// the timeline for each example run: what happened, in order
const timelines: Record<string, { icon: LucideIcon; what: string; chip: string; tone: string }[]> = {
  command: [
    { icon: MessageSquare, what: 'Someone sends', chip: '.hello Sam', tone: 'var(--tf-info)' },
    { icon: ShieldCheck, what: 'Permission checked', chip: 'chat.send ✓', tone: 'var(--tf-ok)' },
    { icon: Zap, what: 'Your command runs', chip: 'tfx.command("hello")', tone: 'var(--tf-accent)' },
    { icon: MessageSquare, what: 'The bot replies', chip: '👋 Hello Sam!', tone: 'var(--tf-ok)' },
  ],
  message: [
    { icon: MessageSquare, what: 'Someone sends', chip: 'hi', tone: 'var(--tf-info)' },
    { icon: Zap, what: 'Event delivered', chip: 'message', tone: 'var(--tf-accent)' },
    { icon: ShieldCheck, what: 'Nothing to do', chip: 'no reply sent', tone: 'var(--tf-warn)' },
  ],
  join: [
    { icon: UserPlus, what: 'Someone joins the group', chip: 'member.join', tone: 'var(--tf-info)' },
    { icon: Zap, what: 'Your handler runs', chip: 'tfx.on("member.join")', tone: 'var(--tf-accent)' },
    { icon: MessageSquare, what: 'The bot replies', chip: '👋 Welcome to the group!', tone: 'var(--tf-ok)' },
  ],
};

export function TestMode() {
  const [id, setId] = useState('command');
  const run = runs.find((r) => r.id === id) ?? runs[0];
  const events = timelines[run.id];
  return (
    <section className="tf-wrap tf-section" aria-labelledby="test-h">
      <div className="tf-stack">
        <p className="tf-eyebrow">Test mode</p>
        <h2 id="test-h" className="tf-h2 tf-silver">Try it before anyone sees it</h2>
        <p className="tf-lead max-w-xl">The test tool runs your plugin on your own computer, with a pretend chat. Pick an example to see what it prints and what happens, step by step.</p>
      </div>
      <div className="tf-tilerow mt-8" role="tablist" aria-label="Example runs">
        {runs.map((r) => {
          const I = r.icon;
          return (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === id} className="tf-tilebtn" onClick={() => setId(r.id)}>
              <span className="tf-tile tf-tile--info" data-on={r.id === id}><I size={24} aria-hidden="true" /></span>
              <span className="tf-tilelabel">{r.label}</span>
            </button>
          );
        })}
      </div>
      <div className="tf-twocol mt-8">
        <figure className="tf-term" style={{ margin: 0 }} aria-label="Example output of the plugin test tool">
          <div className="tf-termbar">
            <span className="tf-preview"><FlaskConical size={12} aria-hidden="true" /> Example</span>
            <span style={{ color: 'var(--tf-dim)', fontSize: '.74rem' }}>not a live run</span>
          </div>
          <div className="tf-termbody">
            <p><span className="dim">$ </span>{run.cmd}</p>
            {run.out.map((l) => <p key={l}><span className="ok">✓ </span>{l}</p>)}
          </div>
        </figure>
        <div className="tf-timeline mt-4 lg:mt-0" role="group" aria-label="Example event timeline">
          <div className="mb-4 flex items-center justify-between">
            <span style={{ color: 'var(--tf-text)', fontWeight: 500 }}>Event timeline</span>
            <span className="tf-preview">Preview</span>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((e, i) => {
              const I = e.icon;
              return (
                <li key={i} className="tf-event">
                  <span className="tf-evicon" style={{ '--c': e.tone } as CSSProperties}><I size={17} aria-hidden="true" /></span>
                  <div className="tf-evrow"><span>{e.what}</span><span className="tf-chip tf-chip--tone" style={{ '--c': e.tone } as CSSProperties}>{e.chip}</span></div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="tf-lead mt-6 max-w-xl" style={{ marginInline: 'auto' }}>
        Want to run real code? <a href={LEGACY.playground} className="tf-link" style={{ padding: 0, color: 'var(--tf-text)' }}>Open the Playground <ArrowRight size={14} aria-hidden="true" /></a>
      </p>
    </section>
  );
}
