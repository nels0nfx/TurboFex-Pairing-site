import { RefreshCw } from 'lucide-react';
import type { PairState } from '@/lib/pairing';
import { MAX_SECONDS } from '@/lib/pairing';
import { Button } from '@/components/Button';
import { CopyButton } from '@/components/CopyButton';
import { CodeDisplay } from './CodeDisplay';

const fmt = (s: number) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

function statusText(s: PairState): string {
  if (s.restoring) return 'Picking up where you left off…';
  if (s.status === 'ended') return 'This attempt ended.';
  if (s.retrying) return s.method === 'code' ? 'Requesting a new pairing code…' : 'Preparing a new QR code…';
  if (s.status === 'code') return 'Waiting for you to enter the code in WhatsApp…';
  if (s.status === 'qr') return 'Waiting for you to scan the QR code…';
  if (s.status === 'linking') return 'Accepted. Finishing the link — keep WhatsApp open…';
  return s.method === 'code' ? 'Requesting your pairing code…' : 'Preparing your QR code…';
}

// step 2: the code or QR is shown here while WhatsApp links
export function WaitStep({ s, onRetry, onCancel }: { s: PairState; onRetry: () => void; onCancel: () => void }) {
  const qr = s.method === 'qr';
  const running = s.status === 'starting' || s.status === 'code' || s.status === 'qr' || s.status === 'linking';
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold tracking-tight">{qr ? 'Scan this QR code' : 'Your pairing code'}</h2>
      <p role="status" aria-live="polite" className="text-sm text-mute">{statusText(s)}</p>

      {s.status === 'ended' ? (
        <div role="alert" className="rounded-lg border border-line bg-bg p-4 text-sm">
          <p>{qr ? 'This QR code has expired or stopped. Press Try again to get a new one.' : 'This code has expired or stopped. Press Try again to get a new one.'}</p>
          {s.endedMsg && <p className="mt-2 text-bad">{s.endedMsg}</p>}
        </div>
      ) : qr ? (
        <div className="grid place-items-center rounded-xl border border-line bg-white p-3">
          {s.qr ? <img src={s.qr} alt="QR code to scan with WhatsApp" className="h-60 w-60" /> : <div className="h-60 w-60 animate-pulse rounded bg-neutral-200" aria-label="Getting ready…" />}
        </div>
      ) : (
        <div className="space-y-4">
          <CodeDisplay code={s.code} />
          <div className="flex justify-center"><CopyButton text={s.code.replace(/-/g, '')} label="Copy code" disabled={!s.code} /></div>
        </div>
      )}

      {running && (
        <div className="space-y-1.5">
          <div className="h-1 overflow-hidden rounded bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, (s.secondsLeft / MAX_SECONDS) * 100)}%` }} /></div>
          <p className="text-xs text-mute">This attempt expires in {fmt(s.secondsLeft)}</p>
        </div>
      )}

      {s.status !== 'ended' && (qr ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-mute">
          <li>On the phone you want to link, open <b className="text-fg">WhatsApp → Settings → Linked devices → Link a device</b>.</li>
          <li>Scan this QR code. You need <b className="text-fg">a second screen</b> to show this page, such as a laptop or another phone.</li>
          <li>If WhatsApp asks again, a new QR code appears here. Scan it too.</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-mute">
          <li>Open <b className="text-fg">WhatsApp</b> on the phone with this number.</li>
          <li>Go to <b className="text-fg">Settings → Linked devices → Link a device</b>.</li>
          <li>Tap <b className="text-fg">Link with phone number instead</b>.</li>
          <li>Type the code above.</li>
        </ol>
      ))}
      {!qr && s.status !== 'ended' && (
        <p className="text-xs text-mute">If WhatsApp says <b>Couldn’t link device</b>, tap OK, then press <b>Try again</b> below for a fresh code. Still not working? Start over and use the QR code instead.</p>
      )}

      <div className="flex flex-wrap gap-3">
        {(s.canRetry || s.retrying) && (
          <Button variant={s.status === 'ended' ? 'primary' : 'outline'} onClick={onRetry} disabled={s.retrying}>
            <RefreshCw size={16} />
            {s.retrying ? 'Getting a new one…' : s.status === 'ended' ? (qr ? 'Try again – new QR code' : 'Try again – new code') : 'Try again'}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>Start over</Button>
      </div>
    </div>
  );
}
