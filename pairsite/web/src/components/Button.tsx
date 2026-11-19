import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger' };

// primary (silver-dark with an accent glow) = the main action of a screen; outline = other actions; danger (red) = removes or stops something
const styles = {
  primary: 'border border-white/15 bg-gradient-to-b from-[#1b1b20] to-[#111114] text-fg shadow-glow hover:border-accent/60',
  outline: 'border border-line bg-raise/50 text-fg hover:border-mute',
  ghost: 'text-mute hover:text-fg',
  danger: 'border border-bad/50 bg-bad/10 text-bad hover:bg-bad/20',
};

export const Button = forwardRef<HTMLButtonElement, Props>(({ variant = 'primary', className, type = 'button', ...p }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}
    {...p}
  />
));
Button.displayName = 'Button';
