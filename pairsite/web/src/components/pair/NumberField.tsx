import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { byIso, cleanInput, describeNumber, flagOf } from '@/lib/phone';
import { cn } from '@/lib/cn';
import { CountrySheet } from './CountrySheet';

export interface NumberFieldProps {
  value: string; iso: string; error: string; disabled: boolean;
  onChange: (value: string, iso: string) => void;
}

// country button + number box, with the live "digits left" line
export function NumberField({ value, iso, error, disabled, onChange }: NumberFieldProps) {
  const [open, setOpen] = useState(false);
  const c = byIso(iso);
  const hint = describeNumber(value, iso);
  const shownIso = hint.analysis.countryChanged || iso;
  const shown = byIso(shownIso);
  return (
    <div className="space-y-2">
      <label htmlFor="number" className="text-sm font-medium">WhatsApp number</label>
      <div className={cn('flex h-12 overflow-hidden rounded-lg border bg-bg', hint.tone === 'bad' || error ? 'border-bad' : hint.tone === 'ok' ? 'border-ok' : 'border-line focus-within:border-accent')}>
        <button type="button" onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
          aria-label={shown ? `Country: ${shown.name} +${shown.dial}. Change` : 'Choose country'}
          className="flex items-center gap-1.5 border-r border-line px-3 text-base disabled:opacity-60">
          <span>{shown ? flagOf(shown.iso) : '🌍'}</span>
          <span className="font-mono text-sm">{shown ? `+${shown.dial}` : '+'}</span>
          <ChevronDown size={14} className="text-mute" />
        </button>
        <input id="number" type="tel" inputMode="tel" autoComplete="tel-national" value={value} readOnly={disabled}
          aria-invalid={error ? true : undefined} aria-describedby="number-hint"
          onChange={(e) => { const r = cleanInput(e.target.value, iso); onChange(r.value, r.iso); }}
          placeholder={c ? 'Your number' : 'Choose your country first'} className="min-w-0 flex-1 bg-transparent px-3 text-base placeholder:text-mute focus:outline-none" />
      </div>
      <p id="number-hint" className={cn('text-xs', hint.tone === 'ok' ? 'text-ok' : hint.tone === 'bad' ? 'text-bad' : 'text-mute')}>{hint.text}</p>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <CountrySheet open={open} selected={shownIso} onClose={() => setOpen(false)} onPick={(i) => { setOpen(false); onChange(value, i); }} />
    </div>
  );
}
