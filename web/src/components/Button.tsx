import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' };

const styles = {
  primary: 'bg-gold text-bg hover:brightness-110 shadow-glow',
  outline: 'border border-line text-fg hover:border-mute',
  ghost: 'text-mute hover:text-fg',
};

export const Button = forwardRef<HTMLButtonElement, Props>(({ variant = 'primary', className, type = 'button', ...p }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}
    {...p}
  />
));
Button.displayName = 'Button';
