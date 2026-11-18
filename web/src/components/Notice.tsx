import { useState } from 'react';
import { X } from 'lucide-react';
import { useSiteStatus } from '@/lib/queries';
import { cn } from '@/lib/cn';

const KEY = 'tfx-notice';
const seen = (id: string) => { try { return sessionStorage.getItem(KEY) === id; } catch { return false; } };

// the colour follows the level: info = blue, warning = orange, critical and maintenance = red
const look = { info: 'border-info/40 bg-info/10 text-info', warning: 'border-warn/40 bg-warn/10 text-warn', critical: 'border-bad/40 bg-bad/10 text-bad', maint: 'border-bad/40 bg-bad/10 text-bad' };

// shows the maintenance notice and the announcement from the admin panel (plain text only, never HTML)
export function Notice() {
  const { data } = useSiteStatus();
  const [gone, setGone] = useState<string | null>(null);
  if (!data) return null;
  const a = data.announcement;
  const showA = a && a.text && !seen(a.id) && gone !== a.id;
  const level = (a && (a.level === 'warning' || a.level === 'critical') ? a.level : 'info') as 'info' | 'warning' | 'critical';
  return (
    <>
      {data.maintenance?.on && <div role="alert" className={cn('border-b px-4 py-2 text-center text-sm', look.maint)}>{data.maintenance.message}</div>}
      {showA && (
        <div role="status" className={cn('flex items-center justify-center gap-3 border-b px-4 py-2 text-sm', look[level])}>
          <p>{a!.text}</p>
          <button aria-label="Dismiss" onClick={() => { try { sessionStorage.setItem(KEY, a!.id); } catch { /* fine */ } setGone(a!.id); }} className="shrink-0 opacity-80 hover:opacity-100"><X size={14} /></button>
        </div>
      )}
    </>
  );
}
