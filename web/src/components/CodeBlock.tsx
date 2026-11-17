import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

// a code box with a copy button (copying can be refused by the phone; then the button says so)
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState('done');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-bg">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-mute">
        <span className="font-mono">{label || 'code'}</span>
        <button onClick={copy} className="inline-flex items-center gap-1.5 hover:text-fg" aria-label="Copy code">
          {state === 'done' ? <Check size={14} /> : <Copy size={14} />}
          {state === 'done' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}
