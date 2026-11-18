import { Github, MessageCircle, Package, ShieldCheck, type LucideIcon } from 'lucide-react';

// Only what TurboFex really works with. Generic icons, no company logos.
const items: { icon: LucideIcon; name: string; note: string }[] = [
  { icon: MessageCircle, name: 'WhatsApp', note: 'Pairing code or QR code' },
  { icon: Github, name: 'GitHub', note: 'Sign-in, release tags and webhooks' },
  { icon: Package, name: 'JavaScript plugins', note: 'Two files, run in a sandbox' },
  { icon: ShieldCheck, name: 'Signed store', note: 'Reviewed, then signed' },
];

export function WorksWith() {
  return (
    <section className="tf-wrap mt-10" aria-labelledby="works-h">
      <div className="tf-works">
        <p className="tf-eyebrow" id="works-h">Works with</p>
        <ul className="tf-workgrid" style={{ listStyle: 'none', padding: 0 }}>
          {items.map(({ icon: I, name, note }) => (
            <li key={name} className="tf-work"><I size={22} aria-hidden="true" /><b>{name}</b><span>{note}</span></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
