import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { cn } from '@/lib/cn';
import { usePairing, type Method } from '@/lib/pairing';
import { detectCountry, phoneReady, validateNumber } from '@/lib/phone';
import { NumberField } from '@/components/pair/NumberField';
import { Steps } from '@/components/pair/Steps';
import { WaitStep } from '@/components/pair/WaitStep';
import { DoneStep } from '@/components/pair/DoneStep';
import { Faq } from '@/components/pair/Faq';

const HINT: Record<Method, string> = {
  code: 'Enter your WhatsApp number to generate a one-time pairing code.',
  qr: 'Show a QR code and scan it with WhatsApp. You need a second screen to display it.',
};

// the "secure connection" badge only claims what is true
const secure = () => location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export default function Pair() {
  const { state: s, setMethod, submit, retry, reset } = usePairing();
  const [text, setText] = useState('');
  const [iso, setIso] = useState(() => (phoneReady() ? detectCountry() : ''));
  const [numErr, setNumErr] = useState('');
  useEffect(() => { document.title = 'Pair your WhatsApp · TurboFex'; }, []);

  if (!phoneReady()) {
    return <main id="main" className="mx-auto max-w-xl px-4 py-12"><Card role="alert">The country list did not load. Please refresh the page.</Card></main>;
  }
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (s.submitting) return;
    setNumErr('');
    if (s.method === 'code') {
      const v = validateNumber(text, iso);
      if (!v.ok) { setNumErr(v.message); return; }
      void submit(v.e164, v.iso);
    } else void submit('', iso);
  };
  const step = s.phase === 'number' ? 1 : s.phase === 'wait' ? 2 : 3;
  return (
    <main id="main" className="mx-auto max-w-xl space-y-10 px-4 py-10 sm:py-14">
      <header className="tf-stack">
        <p className="tf-eyebrow inline-flex items-center gap-1.5"><Lock size={12} aria-hidden="true" />{secure() ? 'Secure connection' : 'Connection not secure'}</p>
        <h1 className="tf-h2 tf-silver">Connect your WhatsApp</h1>
        <p className="tf-lead max-w-md">Link your account to your TurboFex bot in seconds. You stay in control and can unlink any time.</p>
      </header>

      <Card className="space-y-6" id="connect">
        <Steps step={step} />
        {s.phase === 'number' && (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div role="tablist" aria-label="Choose connection method" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-bg p-1">
              {(['code', 'qr'] as Method[]).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={s.method === m} disabled={s.submitting} onClick={() => setMethod(m)}
                  className={cn('h-10 rounded-lg text-sm transition', s.method === m ? 'border border-white/10 bg-raise text-fg' : 'text-mute hover:text-fg')}>{m === 'code' ? 'Pairing code' : 'QR code'}</button>
              ))}
            </div>
            <p className="text-sm text-mute">{HINT[s.method]}</p>
            {s.method === 'code' && <NumberField value={text} iso={iso} error={numErr} disabled={s.submitting} onChange={(v, i) => { setText(v); setIso(i); setNumErr(''); }} />}
            {s.error && <p role="alert" className="text-sm text-bad">{s.error}</p>}
            <Button type="submit" disabled={s.submitting} aria-busy={s.submitting} className="h-12 w-full">
              {s.submitting ? (s.method === 'code' ? 'Generating…' : 'Preparing…') : s.method === 'code' ? 'Generate pairing code' : 'Show QR code'}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-mute"><Lock size={12} />Encrypted in transit and in storage</p>
          </form>
        )}
        {s.phase === 'wait' && <WaitStep s={s} onRetry={() => void retry()} onCancel={reset} />}
        {s.phase === 'done' && <DoneStep s={s} onAgain={reset} />}
      </Card>

      <ul aria-label="Why it is safe" className="tf-cards tf-cards--3" style={{ marginTop: 0 }}>
        {[['One-time session ID', 'Works once and expires in 5 minutes.'], ['Encrypted', 'Stored encrypted and removed after use.'], ['You can unlink', 'Remove it from Linked devices in WhatsApp.']].map(([t, d]) => (
          <li key={t} className="tf-card"><div><h3>{t}</h3><p>{d}</p></div></li>
        ))}
      </ul>
      <Faq />
    </main>
  );
}
