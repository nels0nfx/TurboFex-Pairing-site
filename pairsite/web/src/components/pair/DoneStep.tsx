import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PairState } from '@/lib/pairing';
import { Button } from '@/components/Button';
import { CopyButton } from '@/components/CopyButton';
import { cn } from '@/lib/cn';

const fmt = (s: number) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

function useLeft(endsAt: number, live: boolean) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    if (!live || !endsAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt, live]);
  return left;
}

// step 3: the session ID (it works once and expires)
export function DoneStep({ s, onAgain }: { s: PairState; onAgain: () => void }) {
  const live = s.idState === 'live';
  const left = useLeft(s.idEndsAt, live);
  const id = live && s.sessionId ? s.sessionId : '';
  const word = s.idState === 'used' ? 'Used' : 'Expired';
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-ok"><CheckCircle2 size={20} /><h2 className="text-xl font-semibold tracking-tight text-fg">Linked successfully</h2></div>
      {s.idState === 'used' && <p className="text-sm text-mute">Your bot is logged in. This session ID was used successfully, so it cannot be used again. You can close this page.</p>}

      <div className="space-y-2">
        <p className="text-sm font-medium">Your session ID</p>
        <div aria-disabled={!id} className={cn('break-all rounded-lg border bg-bg p-4 text-center font-mono text-xl tracking-wide', id ? 'border-accent' : 'border-line text-mute')}>{id || word}</div>
        <p className={cn('text-sm', s.idState === 'live' ? (left <= 60 ? 'text-bad' : 'text-mute') : s.idState === 'used' ? 'text-ok' : 'text-bad')}>
          {s.idState === 'used' ? 'Used by your bot. It cannot be used again.' : s.idState === 'expired' ? 'This session ID has expired. Link again to get a new one.' : `Expires in ${fmt(left)}`}
        </p>
        <CopyButton text={id} label="Copy session ID" variant="primary" disabled={!id} />
        {live && <p className="text-sm text-mute">{s.dm === true ? 'A copy was also sent to your WhatsApp (in your own chat).' : s.dm === false ? 'We could not message you on WhatsApp, so copy the ID from here.' : 'Sending a copy to your WhatsApp…'}</p>}
      </div>

      {live && (
        <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
          <h3 className="font-medium">Use it on your bot</h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-mute">
            <li>Open your bot’s panel and add this setting:</li>
          </ol>
          <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-sm">{`SESSION_ID=${id}`}</pre>
          <CopyButton text={`SESSION_ID=${id}`} label="Copy setting" disabled={!id} />
          <p className="text-sm text-mute">Then start the bot. It logs in by itself.</p>
          <p className="text-xs text-mute">The ID works <b>once</b> and expires in <b>5 minutes</b>. Anyone who has it can use your WhatsApp, so keep it private.</p>
        </div>
      )}
      <Button variant="outline" onClick={onAgain}>Link another number</Button>
    </div>
  );
}
