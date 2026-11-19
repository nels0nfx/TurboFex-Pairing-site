import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/copy';
import { Button } from './Button';

// shows "Copied" for a moment; if the phone refuses, it says so (same words as the current page)
export function CopyButton({ text, label, disabled, variant = 'outline', className }: { text: string; label: string; disabled?: boolean; variant?: 'primary' | 'outline' | 'ghost'; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    const ok = await copyText(text);
    setState(ok ? 'ok' : 'fail');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), ok ? 1800 : 2400);
  };
  return (
    <Button variant={variant} onClick={click} disabled={disabled} className={className}>
      {state === 'ok' ? <Check size={16} /> : <Copy size={16} />}
      <span>{state === 'ok' ? 'Copied ✓' : state === 'fail' ? 'Press and hold to copy' : label}</span>
    </Button>
  );
}
