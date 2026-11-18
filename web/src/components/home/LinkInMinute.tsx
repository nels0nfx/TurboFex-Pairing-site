import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, QrCode, Smartphone, type LucideIcon } from 'lucide-react';

const ways: { id: string; icon: LucideIcon; label: string; title: string; text: string; tone: string }[] = [
  { id: 'code', icon: KeyRound, label: 'Code', title: 'Link with a pairing code', text: 'Enter your number, then type the 8-character code in WhatsApp under Linked devices. No second phone needed.', tone: '' },
  { id: 'qr', icon: QrCode, label: 'QR code', title: 'Link with a QR code', text: 'Prefer scanning? Show the QR code here and scan it from WhatsApp on your phone.', tone: 'tf-tile--info' },
  { id: 'id', icon: Smartphone, label: 'Session ID', title: 'Get your session ID', text: 'When the link works you receive a TFX session ID. Put it in your bot settings and you are online.', tone: 'tf-tile--ok' },
];

export function LinkInMinute() {
  const [id, setId] = useState('code');
  const cur = ways.find((w) => w.id === id) ?? ways[0];
  const Big = cur.icon;
  return (
    <section className="tf-wrap tf-section" aria-labelledby="link-h">
      <div className="tf-split">
        <div className="tf-stack">
          <p className="tf-eyebrow">Pairing</p>
          <h2 id="link-h" className="tf-h2 tf-silver">Link in a minute</h2>
          <p className="tf-lead" aria-live="polite"><b style={{ color: 'var(--tf-text)', fontWeight: 500 }}>{cur.title}.</b> {cur.text}</p>
          <Link to="/pair" className="tf-link">Start pairing <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="mt-10 lg:mt-0">
          <div className="flex justify-center" aria-hidden="true"><div className={`tf-tile tf-tile--xl ${cur.tone}`}><Big /></div></div>
          <div className="tf-tilerow mt-9" role="tablist" aria-label="Ways to link">
            {ways.map((w) => {
              const I = w.icon;
              return (
                <button key={w.id} type="button" role="tab" id={`way-${w.id}`} aria-selected={w.id === id} className="tf-tilebtn" onClick={() => setId(w.id)}>
                  <span className={`tf-tile ${w.tone}`} data-on={w.id === id}><I size={26} aria-hidden="true" /></span>
                  <span className="tf-tilelabel">{w.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
