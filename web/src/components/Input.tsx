import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

export const Input = forwardRef<HTMLInputElement, Props>(({ label, hint, className, id, ...p }, ref) => {
  const auto = useId();
  const inputId = id || auto;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
      <input
        ref={ref}
        id={inputId}
        className={cn('h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-base placeholder:text-mute focus:border-accent focus:outline-none', className)}
        {...p}
      />
      {hint && <p className="text-xs text-mute">{hint}</p>}
    </div>
  );
});
Input.displayName = 'Input';
